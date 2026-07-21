import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Gender, MasjidStatus, MemberRelationship, RelationshipType } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { assertMasjidMember } from '../common/utils/tenant-access';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRelationshipDto } from './dto/relationship.dto';

/** A person in the family graph, flattened for rendering. */
export interface TreeNode {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender | null;
  /** The person's relationship label (e.g. "Head", "Spouse", "Son"). */
  relationship: string | null;
  householdId: string;
  householdName: string;
}

export interface TreeEdge {
  id: string;
  type: RelationshipType;
  fromMemberId: string;
  toMemberId: string;
}

export interface FamilyTree {
  rootHouseholdId: string;
  nodes: TreeNode[];
  edges: TreeEdge[];
  /** True when the connected graph was larger than the node cap and was clipped. */
  truncated: boolean;
}

/** Cap on how many people a single tree view will pull in, to bound the payload. */
const MAX_TREE_NODES = 200;

@Injectable()
export class RelationshipsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    actor: AuthUser,
    masjidId: string,
    dto: CreateRelationshipDto,
  ): Promise<MemberRelationship> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);

    if (dto.fromMemberId === dto.toMemberId) {
      throw new BadRequestException('A member cannot be linked to themselves');
    }

    // Both members must exist and belong to this masjid.
    await this.assertMemberInMasjid(masjidId, dto.fromMemberId);
    await this.assertMemberInMasjid(masjidId, dto.toMemberId);

    let { fromMemberId, toMemberId } = dto;

    if (dto.type === RelationshipType.SPOUSE) {
      // Store spouses canonically (lower id first) so the pair is unique regardless of order.
      [fromMemberId, toMemberId] = [fromMemberId, toMemberId].sort();
    } else {
      // PARENT is directed (from = parent, to = child); guard against cycles.
      await this.assertNoParentCycle(masjidId, fromMemberId, toMemberId);
    }

    const existing = await this.prisma.memberRelationship.findFirst({
      where: { fromMemberId, toMemberId, type: dto.type },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.memberRelationship.create({
      data: { masjidId, type: dto.type, fromMemberId, toMemberId },
    });
  }

  async remove(actor: AuthUser, masjidId: string, id: string): Promise<void> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    const { count } = await this.prisma.memberRelationship.deleteMany({ where: { id, masjidId } });
    if (count === 0) {
      throw new NotFoundException('Relationship not found');
    }
  }

  /**
   * Build the connected family graph reachable from a household's members.
   * Traversal is undirected across both PARENT and SPOUSE edges, so relatives in
   * other households are pulled in — giving a genuine multi-household genealogy.
   */
  async tree(actor: AuthUser, masjidId: string, householdId: string): Promise<FamilyTree> {
    assertMasjidMember(actor, masjidId);
    await this.assertHouseholdInMasjid(masjidId, householdId);

    const seed = await this.prisma.householdMember.findMany({
      where: { householdId },
      select: { id: true },
    });

    const edges = await this.prisma.memberRelationship.findMany({ where: { masjidId } });

    // Undirected adjacency for reachability.
    const adjacency = new Map<string, string[]>();
    const link = (a: string, b: string) => {
      (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
    };
    for (const edge of edges) {
      link(edge.fromMemberId, edge.toMemberId);
      link(edge.toMemberId, edge.fromMemberId);
    }

    const reachable = new Set<string>();
    const queue = seed.map((m) => m.id);
    let truncated = false;
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      if (reachable.size >= MAX_TREE_NODES) {
        truncated = true;
        break;
      }
      reachable.add(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!reachable.has(next)) queue.push(next);
      }
    }

    const members = await this.prisma.householdMember.findMany({
      where: { id: { in: [...reachable] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        relationship: true,
        householdId: true,
        household: { select: { familyName: true } },
      },
    });

    const nodes: TreeNode[] = members.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      gender: m.gender,
      relationship: m.relationship,
      householdId: m.householdId,
      householdName: m.household.familyName,
    }));

    // Only keep edges whose both endpoints made it into the (possibly clipped) node set.
    const treeEdges: TreeEdge[] = edges
      .filter((e) => reachable.has(e.fromMemberId) && reachable.has(e.toMemberId))
      .map((e) => ({
        id: e.id,
        type: e.type,
        fromMemberId: e.fromMemberId,
        toMemberId: e.toMemberId,
      }));

    return { rootHouseholdId: householdId, nodes, edges: treeEdges, truncated };
  }

  /**
   * Reject a PARENT edge (parent -> child) that would create a cycle, i.e. when the
   * proposed parent is already a descendant of the proposed child.
   */
  private async assertNoParentCycle(
    masjidId: string,
    parentId: string,
    childId: string,
  ): Promise<void> {
    const parentEdges = await this.prisma.memberRelationship.findMany({
      where: { masjidId, type: RelationshipType.PARENT },
      select: { fromMemberId: true, toMemberId: true },
    });
    const childrenOf = new Map<string, string[]>();
    for (const edge of parentEdges) {
      (
        childrenOf.get(edge.fromMemberId) ??
        childrenOf.set(edge.fromMemberId, []).get(edge.fromMemberId)!
      ).push(edge.toMemberId);
    }

    // Walk descendants of the proposed child; if we reach the proposed parent, it's a cycle.
    const seen = new Set<string>();
    const queue = [childId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === parentId) {
        throw new BadRequestException('This parent link would create a cycle');
      }
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...(childrenOf.get(current) ?? []));
    }
  }

  private async assertMemberInMasjid(masjidId: string, memberId: string): Promise<void> {
    const member = await this.prisma.householdMember.findFirst({
      where: { id: memberId, household: { masjidId } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Member not found in this masjid');
    }
  }

  private async assertHouseholdInMasjid(masjidId: string, householdId: string): Promise<void> {
    const household = await this.prisma.household.findFirst({
      where: { id: householdId, masjidId },
      select: { id: true },
    });
    if (!household) {
      throw new NotFoundException('Household not found');
    }
  }

  private async assertMasjidWritable(masjidId: string): Promise<void> {
    const masjid = await this.prisma.masjid.findUnique({
      where: { id: masjidId },
      select: { status: true },
    });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    if (masjid.status === MasjidStatus.ARCHIVED) {
      throw new BadRequestException('Cannot modify content of an archived masjid');
    }
  }
}

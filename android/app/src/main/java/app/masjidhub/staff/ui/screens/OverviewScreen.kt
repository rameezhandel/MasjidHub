package app.masjidhub.staff.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.masjidhub.staff.data.Announcement
import app.masjidhub.staff.data.DuesList
import app.masjidhub.staff.data.HouseholdSummary
import app.masjidhub.staff.data.Page
import app.masjidhub.staff.data.PrayerTimetableEntry
import app.masjidhub.staff.data.endpoint
import app.masjidhub.staff.ui.SessionViewModel
import app.masjidhub.staff.ui.components.DetailRow
import app.masjidhub.staff.ui.components.Loader
import app.masjidhub.staff.ui.components.NoMasjid
import app.masjidhub.staff.ui.components.ScreenScroll
import app.masjidhub.staff.ui.components.SectionCard
import app.masjidhub.staff.ui.components.StatTile
import app.masjidhub.staff.ui.theme.accentGold
import app.masjidhub.staff.util.Format
import kotlinx.serialization.builtins.ListSerializer

private data class Snapshot(
    val today: PrayerTimetableEntry?,
    val households: HouseholdSummary,
    val dues: DuesList,
    val announcements: List<Announcement>,
)

@Composable
fun OverviewScreen(session: SessionViewModel, refreshTick: Int) {
    val masjidId = session.masjidId ?: return NoMasjid()
    val timezone = session.masjid?.timezone

    Loader(
        masjidId,
        refreshTick,
        timezone,
        load = {
            val day = Format.today(timezone)
            val times = session.api.get(
                endpoint("/masjids/$masjidId/prayer-times", mapOf("from" to day, "to" to day)),
                ListSerializer(PrayerTimetableEntry.serializer()),
            )
            Snapshot(
                today = times.firstOrNull(),
                households = session.api.get(
                    "/masjids/$masjidId/households/summary",
                    HouseholdSummary.serializer(),
                ),
                dues = session.api.get(
                    endpoint("/masjids/$masjidId/dues", mapOf("pageSize" to "1")),
                    DuesList.serializer(),
                ),
                announcements = session.api.get(
                    endpoint(
                        "/masjids/$masjidId/announcements",
                        mapOf("pageSize" to "3", "status" to "PUBLISHED"),
                    ),
                    Page.serializer(Announcement.serializer()),
                ).data,
            )
        },
    ) { snapshot ->
        ScreenScroll {
            SectionCard {
                Text(
                    "Assalamu alaikum, ${session.user?.firstName.orEmpty()}",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(session.masjid?.name ?: "—")
                session.masjid?.city?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            SectionCard(title = "Today", accessory = Format.weekday(snapshot.today?.date)) {
                val entry = snapshot.today
                if (entry == null) {
                    Text(
                        "No timetable for today yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    entry.prayers.forEach { prayer ->
                        Row(Modifier.fillMaxWidth()) {
                            Text(prayer.name)
                            Spacer(Modifier.weight(1f))
                            Text(prayer.adhan)
                            prayer.iqamah?.takeIf { it.isNotBlank() }?.let {
                                Text(" · $it", color = accentGold)
                            }
                        }
                    }
                    entry.jumuah1?.takeIf { it.isNotBlank() }?.let {
                        HorizontalDivider()
                        DetailRow("Jumu'ah", it)
                    }
                }
            }

            SectionCard(title = "Dues") {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatTile(
                        "Outstanding",
                        Format.money(snapshot.dues.totals.balanceCents, snapshot.dues.totals.currency),
                        emphasis = snapshot.dues.totals.balanceCents > 0,
                    )
                    StatTile(
                        "Collected",
                        Format.money(snapshot.dues.totals.paidCents, snapshot.dues.totals.currency),
                    )
                    StatTile("Owing", "${snapshot.dues.totals.owingHouseholds}")
                }
            }

            SectionCard(title = "Community") {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatTile("Households", "${snapshot.households.total}")
                    StatTile("Active", "${snapshot.households.active}")
                    StatTile("Members", "${snapshot.households.members}")
                }
            }

            SectionCard(title = "Latest announcements") {
                if (snapshot.announcements.isEmpty()) {
                    Text(
                        "Nothing published yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    snapshot.announcements.forEach { item ->
                        Column {
                            Text(item.title, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                Format.instant(item.publishedAt, timezone),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

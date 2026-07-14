import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { DATE_PATTERN } from './dto/prayer-times.dto';

@Injectable()
export class DatePathPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!DATE_PATTERN.test(value) || Number.isNaN(new Date(value).getTime())) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD date');
    }
    return value;
  }
}

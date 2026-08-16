package app.masjidhub.staff.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.masjidhub.staff.data.PrayerTimetableEntry
import app.masjidhub.staff.data.endpoint
import app.masjidhub.staff.ui.SessionViewModel
import app.masjidhub.staff.ui.components.EmptyState
import app.masjidhub.staff.ui.components.Loader
import app.masjidhub.staff.ui.components.NoMasjid
import app.masjidhub.staff.ui.components.ScreenScroll
import app.masjidhub.staff.ui.components.SectionCard
import app.masjidhub.staff.ui.theme.accentGold
import app.masjidhub.staff.util.Format
import kotlinx.serialization.builtins.ListSerializer

@Composable
fun PrayerTimesScreen(session: SessionViewModel, refreshTick: Int) {
    val masjidId = session.masjidId ?: return NoMasjid()
    val timezone = session.masjid?.timezone
    var days by remember { mutableIntStateOf(7) }

    Column(Modifier.fillMaxSize()) {
        // Outside the loader, so switching range doesn't make the control vanish.
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(selected = days == 7, onClick = { days = 7 }, label = { Text("7 days") })
            FilterChip(selected = days == 30, onClick = { days = 30 }, label = { Text("30 days") })
        }

        Loader(
            masjidId,
            refreshTick,
            days,
            timezone,
            load = {
                session.api.get(
                    endpoint(
                        "/masjids/$masjidId/prayer-times",
                        mapOf(
                            "from" to Format.today(timezone),
                            "to" to Format.today(timezone, (days - 1).toLong()),
                        ),
                    ),
                    ListSerializer(PrayerTimetableEntry.serializer()),
                )
            },
        ) { entries ->
            if (entries.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.DateRange,
                    title = "No timetable",
                    detail = "Generate the timetable from the web dashboard and it will appear here.",
                )
            } else {
                val today = Format.today(timezone)
                ScreenScroll {
                    entries.forEach { entry ->
                        SectionCard(
                            title = Format.weekday(entry.date),
                            accessory = if (entry.date == today) "Today" else null,
                        ) {
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
                            val jumuah = entry.jumuah1
                            if (!jumuah.isNullOrBlank()) {
                                HorizontalDivider()
                                Row(Modifier.fillMaxWidth()) {
                                    Text("Jumu'ah")
                                    Spacer(Modifier.weight(1f))
                                    Text(jumuah, color = accentGold)
                                    entry.jumuah2?.takeIf { it.isNotBlank() }?.let {
                                        Text(" · $it", color = accentGold)
                                    }
                                }
                            }
                        }
                    }
                    Text(
                        "Times are the masjid's local wall clock.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

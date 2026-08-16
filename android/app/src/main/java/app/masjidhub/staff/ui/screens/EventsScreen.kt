package app.masjidhub.staff.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Event
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.masjidhub.staff.data.MasjidEvent
import app.masjidhub.staff.data.Page
import app.masjidhub.staff.data.endpoint
import app.masjidhub.staff.ui.SessionViewModel
import app.masjidhub.staff.ui.components.EmptyState
import app.masjidhub.staff.ui.components.Loader
import app.masjidhub.staff.ui.components.NoMasjid
import app.masjidhub.staff.ui.components.ScreenScroll
import app.masjidhub.staff.ui.components.SectionCard
import app.masjidhub.staff.ui.components.StatusPill
import app.masjidhub.staff.ui.theme.accentGold
import app.masjidhub.staff.util.Format

@Composable
fun EventsScreen(session: SessionViewModel, refreshTick: Int) {
    val masjidId = session.masjidId ?: return NoMasjid()
    val timezone = session.masjid?.timezone
    var upcomingOnly by remember { mutableStateOf(true) }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = upcomingOnly,
                onClick = { upcomingOnly = true },
                label = { Text("Upcoming") },
            )
            FilterChip(
                selected = !upcomingOnly,
                onClick = { upcomingOnly = false },
                label = { Text("All") },
            )
        }

        Loader(
            masjidId,
            refreshTick,
            upcomingOnly,
            load = {
                session.api.get(
                    endpoint(
                        "/masjids/$masjidId/events",
                        mapOf(
                            "pageSize" to "50",
                            "upcoming" to if (upcomingOnly) "true" else null,
                        ),
                    ),
                    Page.serializer(MasjidEvent.serializer()),
                ).data
            },
        ) { events ->
            if (events.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.Event,
                    title = if (upcomingOnly) "Nothing coming up" else "No events",
                    detail = "Events created from the web dashboard show up here.",
                )
            } else {
                ScreenScroll {
                    events.forEach { event ->
                        SectionCard {
                            Row(Modifier.fillMaxWidth()) {
                                Text(event.title, style = MaterialTheme.typography.titleMedium)
                                Spacer(Modifier.weight(1f))
                                StatusPill(event.status)
                            }
                            Text(
                                Format.range(event.startsAt, event.endsAt, timezone),
                                style = MaterialTheme.typography.bodyMedium,
                                color = accentGold,
                            )
                            event.location?.takeIf { it.isNotBlank() }?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            event.description?.takeIf { it.isNotBlank() }?.let {
                                Text(it, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
        }
    }
}

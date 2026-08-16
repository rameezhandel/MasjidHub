package app.masjidhub.staff.ui.screens

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.masjidhub.staff.data.Announcement
import app.masjidhub.staff.data.Page
import app.masjidhub.staff.data.endpoint
import app.masjidhub.staff.ui.SessionViewModel
import app.masjidhub.staff.ui.components.EmptyState
import app.masjidhub.staff.ui.components.Loader
import app.masjidhub.staff.ui.components.NoMasjid
import app.masjidhub.staff.ui.components.ScreenScroll
import app.masjidhub.staff.ui.components.SectionCard
import app.masjidhub.staff.ui.components.StatusPill
import app.masjidhub.staff.util.Format

@Composable
fun AnnouncementsScreen(session: SessionViewModel, refreshTick: Int) {
    val masjidId = session.masjidId ?: return NoMasjid()
    val timezone = session.masjid?.timezone

    Loader(
        masjidId,
        refreshTick,
        load = {
            session.api.get(
                endpoint("/masjids/$masjidId/announcements", mapOf("pageSize" to "50")),
                Page.serializer(Announcement.serializer()),
            ).data
        },
    ) { items ->
        if (items.isEmpty()) {
            EmptyState(
                icon = Icons.Filled.Campaign,
                title = "No announcements",
                detail = "Announcements posted from the web dashboard show up here.",
            )
        } else {
            ScreenScroll {
                items.forEach { item ->
                    SectionCard {
                        Row(Modifier.fillMaxWidth()) {
                            Text(item.title, style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.weight(1f))
                            StatusPill(item.status)
                        }
                        Text(item.body, style = MaterialTheme.typography.bodyMedium)
                        item.publishedAt?.let {
                            Text(
                                Format.instant(it, timezone),
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

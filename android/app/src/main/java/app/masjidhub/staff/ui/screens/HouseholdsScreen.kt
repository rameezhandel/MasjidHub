package app.masjidhub.staff.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.masjidhub.staff.data.Household
import app.masjidhub.staff.data.Page
import app.masjidhub.staff.data.endpoint
import app.masjidhub.staff.ui.SessionViewModel
import app.masjidhub.staff.ui.components.EmptyState
import app.masjidhub.staff.ui.components.ErrorState
import app.masjidhub.staff.ui.components.NoMasjid
import app.masjidhub.staff.ui.components.StatusPill
import app.masjidhub.staff.ui.components.rememberPaged
import app.masjidhub.staff.ui.theme.accentGold
import kotlinx.coroutines.delay

private val STATUSES = listOf("ALL" to "All", "ACTIVE" to "Active", "INACTIVE" to "Inactive", "MOVED_OUT" to "Moved out")

@Composable
fun HouseholdsScreen(
    session: SessionViewModel,
    refreshTick: Int,
    onOpen: (Household) -> Unit,
) {
    val masjidId = session.masjidId ?: return NoMasjid()

    var query by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("ALL") }

    // Typing shouldn't fire a request per keystroke.
    LaunchedEffect(query) {
        delay(350)
        search = query
    }

    val paged = rememberPaged<Household>(masjidId, refreshTick, search, status) { page ->
        val result = session.api.get(
            endpoint(
                "/masjids/$masjidId/households",
                mapOf(
                    "page" to "$page",
                    "pageSize" to "25",
                    "search" to search.ifBlank { null },
                    "status" to status.takeIf { it != "ALL" },
                ),
            ),
            Page.serializer(Household.serializer()),
        )
        result.data to result.meta
    }

    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Family, head or city") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
        Row(
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            STATUSES.forEach { (value, label) ->
                FilterChip(
                    selected = status == value,
                    onClick = { status = value },
                    label = { Text(label) },
                )
            }
        }

        val error = paged.error
        when {
            error != null -> ErrorState(error) { paged.retry() }
            paged.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = accentGold)
            }
            paged.items.isEmpty() -> EmptyState(
                icon = Icons.Filled.Groups,
                title = "No households",
                detail = if (search.isBlank()) {
                    "Add households from the web dashboard."
                } else {
                    "Nothing matches “$search”."
                },
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                items(paged.items, key = { it.id }) { household ->
                    HouseholdRow(household, Modifier.widthIn(max = 720.dp)) { onOpen(household) }
                }
                if (paged.canLoadMore) {
                    item {
                        Button(onClick = { paged.loadMore() }, enabled = !paged.loadingMore) {
                            Text(if (paged.loadingMore) "Loading…" else "Load more")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HouseholdRow(household: Household, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(household.familyName, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.weight(1f))
            StatusPill(household.status)
        }
        Text(
            household.headName,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            listOfNotNull(
                "${household.memberCount} members",
                household.city?.takeIf { it.isNotBlank() },
            ).joinToString(" · "),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

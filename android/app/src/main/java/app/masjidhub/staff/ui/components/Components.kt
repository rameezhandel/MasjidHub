package app.masjidhub.staff.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.rememberCoroutineScope
import app.masjidhub.staff.data.PageMeta
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import app.masjidhub.staff.ui.theme.accentGold
import app.masjidhub.staff.util.Format

/** Every screen loads the same way: spinner, content, or an error with a retry. */
sealed interface LoadState<out T> {
    data object Loading : LoadState<Nothing>
    data class Loaded<T>(val value: T) : LoadState<T>
    data class Failed(val message: String) : LoadState<Nothing>
}

/**
 * Runs [load] whenever [keys] change and renders the result. Modelling it once
 * keeps every screen down to the part that is actually its own.
 */
@Composable
fun <T> Loader(
    vararg keys: Any?,
    load: suspend () -> T,
    content: @Composable (T) -> Unit,
) {
    val keyList = keys.toList()
    var attempt by remember { mutableIntStateOf(0) }
    var state by remember(keyList) { mutableStateOf<LoadState<T>>(LoadState.Loading) }

    LaunchedEffect(keyList, attempt) {
        state = LoadState.Loading
        state = try {
            LoadState.Loaded(load())
        } catch (e: Exception) {
            LoadState.Failed(e.message ?: "Something went wrong.")
        }
    }

    when (val current = state) {
        is LoadState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = accentGold)
        }
        is LoadState.Failed -> ErrorState(current.message) { attempt++ }
        is LoadState.Loaded -> content(current.value)
    }
}

@Composable
fun ErrorState(message: String, retry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Filled.Warning, contentDescription = null, tint = accentGold)
        Text(message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = retry) { Text("Try again") }
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, detail: String? = null) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(title, style = MaterialTheme.typography.titleMedium)
        if (detail != null) {
            Text(
                detail,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** A titled card, the app's one container shape. */
@Composable
fun SectionCard(
    title: String? = null,
    accessory: String? = null,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (title != null || accessory != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (title != null) {
                        Text(title, style = MaterialTheme.typography.titleMedium)
                    }
                    Box(Modifier.weight(1f))
                    if (accessory != null) {
                        Text(
                            accessory,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            content()
        }
    }
}

/** One number with a caption — the overview and dues headers are rows of these. */
@Composable
fun RowScope.StatTile(label: String, value: String, emphasis: Boolean = false) {
    Column(Modifier.weight(1f)) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (emphasis) accentGold else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

/** Statuses, coloured the way the web app colours them. */
@Composable
fun StatusPill(status: String) {
    val tint = when (status) {
        "ACTIVE", "PUBLISHED" -> MaterialTheme.colorScheme.primary
        "MOVED_OUT", "CANCELLED", "ARCHIVED" -> MaterialTheme.colorScheme.onSurfaceVariant
        else -> accentGold
    }
    Text(
        text = Format.label(status),
        style = MaterialTheme.typography.labelSmall,
        color = tint,
    )
}

/** A label/value row, used all over the detail screens. */
@Composable
fun DetailRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Box(Modifier.weight(1f))
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.End,
        )
    }
}

/** Screens are centred and capped so a tablet doesn't stretch text edge to edge. */
val contentWidth: Modifier = Modifier.widthIn(max = 720.dp)

/** Shown when the signed-in account has no masjid (a platform admin). */
@Composable
fun NoMasjid() {
    EmptyState(
        icon = Icons.Filled.Warning,
        title = "No masjid linked",
        detail = "This account is not linked to a masjid, so there is nothing to show.",
    )
}

/** The standard scrolling page: centred, padded, capped on wide screens. */
@Composable
fun ScreenScroll(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier.widthIn(max = 720.dp).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            content = content,
        )
    }
}

/**
 * A page of results that can grow. Changing [keys] starts over from page one;
 * [loadMore] appends the next page and leaves what is already on screen alone.
 */
class PagedState<T> internal constructor(
    private val scope: CoroutineScope,
    private val fetch: suspend (Int) -> Pair<List<T>, PageMeta>,
) {
    var items by mutableStateOf<List<T>>(emptyList())
        private set
    var meta by mutableStateOf<PageMeta?>(null)
        private set
    var loading by mutableStateOf(true)
        private set
    var loadingMore by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    private var page = 1

    val canLoadMore: Boolean get() = meta?.let { page < it.totalPages } ?: false

    suspend fun reload() {
        loading = true
        error = null
        try {
            val (rows, pageMeta) = fetch(1)
            page = 1
            items = rows
            meta = pageMeta
        } catch (e: Exception) {
            error = e.message ?: "Something went wrong."
        }
        loading = false
    }

    fun retry() {
        scope.launch { reload() }
    }

    fun loadMore() {
        if (loadingMore || !canLoadMore) return
        loadingMore = true
        scope.launch {
            try {
                val (rows, pageMeta) = fetch(page + 1)
                page += 1
                items = items + rows
                meta = pageMeta
            } catch (_: Exception) {
                // A failed "load more" shouldn't blow away the rows already shown.
            }
            loadingMore = false
        }
    }
}

@Composable
fun <T> rememberPaged(
    vararg keys: Any?,
    fetch: suspend (Int) -> Pair<List<T>, PageMeta>,
): PagedState<T> {
    val scope = rememberCoroutineScope()
    val keyList = keys.toList()
    val state = remember(keyList) { PagedState(scope, fetch) }
    LaunchedEffect(keyList) { state.reload() }
    return state
}

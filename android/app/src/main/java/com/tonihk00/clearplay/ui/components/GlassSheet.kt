package com.tonihk00.clearplay.ui.components

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.dialog
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.tonihk00.clearplay.ui.theme.Cp
import com.tonihk00.clearplay.ui.theme.LocalReduceMotion
import dev.chrisbanes.haze.HazeState
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * Where the app's bottom sheets (song menu, sleep timer) are drawn: one place in the activity's
 * own window, above the page, the dock and the full player, which are all Haze sources
 * (AppRoot). A Material ModalBottomSheet draws in a window of its own, where Haze can't see
 * them, so these sheets are an overlay instead.
 */
@Stable
class SheetHost {
    internal var content by mutableStateOf<(@Composable () -> Unit)?>(null)
    private var owner: Any? = null

    /** Live blur source, or null (blur off): the sheet then uses liveGlass's solid fallback. */
    var haze by mutableStateOf<HazeState?>(null)

    /** A sheet is showing: everything under it is hidden from TalkBack (AppRoot). */
    val showing: Boolean get() = content != null

    internal fun show(key: Any, sheet: @Composable () -> Unit) {
        owner = key
        content = sheet
    }

    internal fun hide(key: Any) {
        if (owner === key) {
            owner = null
            content = null
        }
    }

    /** Draws the sheet that is showing, if any. Put this above everything it should cover. */
    @Composable
    fun Overlay() {
        content?.invoke()
    }
}

/** The app's sheet host (AppRoot). Null in tests and previews: sheets then draw in place. */
val LocalSheetHost = staticCompositionLocalOf<SheetHost?> { null }

val SheetShape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)

/** Black under the sheet's glass tint (blur on or off). */
const val SheetDim = 0.6f

/**
 * A modal bottom sheet of frosted glass (liveGlass: the app's blur, tint, fill and border).
 * Slides up when shown; the dim scrim (tap), dragging it down and Back close it (sliding down,
 * then [onDismiss]). [onDismiss] called by the content itself closes it at once, like the
 * Material sheet it replaces. TalkBack reads it as a dialog named [paneTitle].
 */
@Composable
fun GlassSheet(paneTitle: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val host = LocalSheetHost.current
    if (host == null) {
        GlassSheetLayout(null, paneTitle, onDismiss, content)
        return
    }
    val dismiss by rememberUpdatedState(onDismiss)
    val body by rememberUpdatedState(content)
    val title by rememberUpdatedState(paneTitle)
    val key = remember { Any() }
    DisposableEffect(host, key) {
        host.show(key) { GlassSheetLayout(host.haze, title, { dismiss() }) { body() } }
        onDispose { host.hide(key) }
    }
}

/** The sheet itself, drawn where it is called. [haze] null: solid dark glass. */
@Composable
fun GlassSheetLayout(haze: HazeState?, paneTitle: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val reduce = LocalReduceMotion.current
    val scope = rememberCoroutineScope()
    // 1 = hidden below the screen edge, 0 = fully up.
    val hidden = remember { Animatable(1f) }
    var heightPx by remember { mutableIntStateOf(0) }
    var closing by remember { mutableStateOf(false) }
    val dismiss by rememberUpdatedState(onDismiss)
    val focus = remember { FocusRequester() }

    fun close() {
        if (closing) return
        closing = true
        scope.launch {
            if (reduce) hidden.snapTo(1f) else hidden.animateTo(1f, tween(Cp.ScreenMs, easing = Cp.EaseOutSoft))
            dismiss()
        }
    }

    LaunchedEffect(heightPx > 0) {
        if (heightPx == 0) return@LaunchedEffect
        if (reduce) hidden.snapTo(0f) else hidden.animateTo(0f, tween(Cp.ScreenMs, easing = Cp.EaseOutSoft))
    }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    // Overlay priority: the sheet is on top of everything, so it takes Back before the full player
    // and the page stack, whose handlers (normal priority) can register again after the sheet opened
    // and would then take Back first (1.6.1: the menu over the full player's queue ignored a Back).
    val dispatcher = androidx.navigationevent.compose.LocalNavigationEventDispatcherOwner.current?.navigationEventDispatcher
    if (dispatcher == null) {
        BackHandler { close() }
    } else {
        val onBack by rememberUpdatedState({ close() })
        val handler = remember { SheetBackHandler { onBack() } }
        DisposableEffect(dispatcher, handler) {
            dispatcher.addHandler(handler, androidx.navigationevent.NavigationEventDispatcher.PRIORITY_OVERLAY)
            onDispose { handler.remove() }
        }
    }

    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .testTag("sheetScrim")
                .drawBehind { drawRect(Color.Black.copy(alpha = 0.45f * (1f - hidden.value))) }
                .pointerInput(Unit) { detectTapGestures { close() } }
                .semantics {
                    traversalIndex = 1f
                    contentDescription = "Close sheet"
                    onClick { close(); true }
                },
        )
        val drag = rememberDraggableState { dy ->
            if (heightPx > 0 && !closing) scope.launch { hidden.snapTo((hidden.value + dy / heightPx).coerceIn(0f, 1f)) }
        }
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .onSizeChanged { heightPx = it.height }
                .offset { IntOffset(0, (hidden.value * heightPx).roundToInt()) }
                // Not drawn until measured, so it never flashes at the top before sliding up.
                .alpha(if (heightPx == 0) 0f else 1f)
                .testTag("sheet")
                .semantics {
                    this.paneTitle = paneTitle
                    dialog()
                    isTraversalGroup = true
                    traversalIndex = 0f
                }
                .draggable(
                    drag, Orientation.Vertical,
                    onDragStopped = { velocity ->
                        if (closing) return@draggable
                        if (hidden.value > 0.25f || velocity > 1500f) {
                            close()
                        } else {
                            hidden.animateTo(0f, tween(Cp.ControlMs, easing = Cp.EaseOutSoft))
                        }
                    },
                )
                // The page behind is dimmed like the scrim and more: text over a white cover
                // stays readable (white 7:1, the faint line 3:1 over pure white).
                .liveGlass(haze, SheetShape, dim = SheetDim)
                // Focus moves into the sheet (keyboard, D-pad, TalkBack). A focused node gets the
                // Back key before the back dispatcher (Compose would only clear the focus), so the
                // sheet takes it itself; the back gesture goes through BackHandler below.
                .onPreviewKeyEvent { e ->
                    if (e.key == Key.Back || e.key == Key.Escape) {
                        if (e.type == KeyEventType.KeyUp) close()
                        true
                    } else {
                        false
                    }
                }
                .focusRequester(focus)
                .focusable(),
            content = content,
        )
    }
}

/** The sheet's Back (button, key and gesture), registered with overlay priority (GlassSheetLayout). */
private class SheetBackHandler(private val back: () -> Unit) :
    androidx.navigationevent.NavigationEventHandler<androidx.navigationevent.NavigationEventInfo>(
        androidx.navigationevent.NavigationEventInfo.None, true,
    ) {
    override fun onBackCompleted() { back() }
}

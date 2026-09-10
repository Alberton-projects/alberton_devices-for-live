// Beat Window — the floating display, drawn with mgraphics in a jsui.
//
// It receives three messages from the device patcher and draws them; it owns no timing.
//   beat <bar> <beat>   the transport position, both 1-based; a new beat pulses the ring
//   flash <0|1>         whether a new beat should pulse
//   blink <ms>          how long a pulse takes to fade
//
// The look is the original's: a warm digit, large and centred, on a dark disc, with the
// bar.beat position beneath it. A ring around the disc flashes on the beat and fades over
// `blink` ms. The drawing reads its size from the box every paint, so it rescales with the
// window (the patcher resizes the box to the window through thispatcher).

autowatch = 1;
mgraphics.init();
mgraphics.relative_coords = 0;   // draw in pixels, top-left origin
mgraphics.autofill = 0;

var curBar = 0, curBeat = 0;     // current position, 1-based; 0 before the first message
var lastBeat = -1;               // to notice a new beat
var flashEnabled = 1;
var blinkMs = 120;
var flashLevel = 0;              // 1 at the beat, fades to 0
var FADE_MS = 33;                // the fade redraws at ~30 fps
var fade = new Task(fadeStep, this);

// Colours, matched to the original: near-black ground, a darker disc, a warm digit.
var COL_BG   = [0.105, 0.117, 0.149, 1.0];
var COL_DISC = [0.071, 0.078, 0.098, 1.0];
var COL_NUM  = [0.878, 0.478, 0.298, 1.0];
var COL_SUB  = [0.50,  0.53,  0.58,  1.0];
var COL_RING = [0.878, 0.478, 0.298, 1.0];

// ---- messages from the patcher --------------------------------------------

function beat(b, t) {
    var changed = (b !== curBar) || (t !== curBeat);
    curBar = b; curBeat = t;
    if (t !== lastBeat) {                // a new beat
        lastBeat = t;
        if (flashEnabled) startFlash();
    }
    if (changed) mgraphics.redraw();
}

function flash(on) {
    flashEnabled = on ? 1 : 0;
    if (!flashEnabled) { flashLevel = 0; fade.cancel(); mgraphics.redraw(); }
}

function blink(ms) { blinkMs = Math.max(1, ms); }

// ---- the pulse, faded on a wall clock (visual only, not musical timing) ----

function startFlash() {
    flashLevel = 1;
    fade.cancel();
    fade.interval = FADE_MS;
    fade.repeat();
}

function fadeStep() {
    flashLevel -= FADE_MS / blinkMs;      // a full fade takes blink ms
    if (flashLevel <= 0) { flashLevel = 0; fade.cancel(); }
    mgraphics.redraw();
}

// ---- what to write, kept pure so it can be tested without a canvas ---------

function bigLabel(t) { return t > 0 ? String(t) : "0"; }
function formatPos(b, t) { return (b > 0 ? b : 0) + "." + (t > 0 ? t : 0); }

// ---- drawing ---------------------------------------------------------------

function paint() {
    var r = this.box.rect;
    var w = r[2] - r[0], h = r[3] - r[1];
    var cx = w / 2, cy = h / 2;
    var rx = w * 0.46, ry = h * 0.46;
    with (mgraphics) {
        set_source_rgba(COL_BG);   rectangle(0, 0, w, h); fill();
        set_source_rgba(COL_DISC); ellipse(cx - rx, cy - ry, rx * 2, ry * 2); fill();

        if (flashLevel > 0) {
            set_source_rgba(COL_RING[0], COL_RING[1], COL_RING[2], flashLevel * 0.9);
            set_line_width(Math.max(2, h * 0.02));
            ellipse(cx - rx, cy - ry, rx * 2, ry * 2); stroke();
        }

        select_font_face("Arial Bold");
        var big = bigLabel(curBeat);
        set_font_size(h * 0.5);
        var d1 = text_measure(big);
        set_source_rgba(COL_NUM);
        move_to(cx - d1[0] / 2, cy + d1[1] * 0.32);
        show_text(big);

        var pos = formatPos(curBar, curBeat);
        set_font_size(Math.max(8, h * 0.12));
        var d2 = text_measure(pos);
        set_source_rgba(COL_SUB);
        move_to(cx - d2[0] / 2, cy + ry * 0.74);
        show_text(pos);
    }
}

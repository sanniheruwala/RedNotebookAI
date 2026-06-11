"""Headless-browser HTML rendering for PDF / PNG export.

Playwright is an *optional* dependency (``pip install rednotebook-ai[exports]``
+ ``playwright install chromium``). The module raises a clear runtime error
when called without it instead of failing at import — the rest of the
visualization stack should keep working on installs that never need
infographic exports.
"""

from __future__ import annotations

import logging
from typing import Literal

_log = logging.getLogger(__name__)

_INSTALL_HINT = (
    "Playwright is not installed. Install the exports extra and the bundled "
    "Chromium runtime:\n"
    "    pip install 'rednotebook-ai[exports]'\n"
    "    playwright install chromium"
)


def _launch_playwright():  # type: ignore[no-untyped-def]
    try:
        from playwright.sync_api import sync_playwright  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(_INSTALL_HINT) from exc
    return sync_playwright


def render_html_to_pdf(
    html: str,
    *,
    width_px: int = 1200,
    print_background: bool = True,
) -> bytes:
    """Render the given HTML document to PDF bytes (A4 portrait, with backgrounds).

    The HTML is fully self-contained: no relative asset loading happens, so
    the page is rendered offline with networking disabled.
    """
    sync_playwright = _launch_playwright()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport={"width": width_px, "height": 800},
                java_script_enabled=True,
            )
            page = context.new_page()
            page.set_content(html, wait_until="networkidle")
            return page.pdf(
                format="A4",
                print_background=print_background,
                margin={"top": "10mm", "bottom": "10mm", "left": "10mm", "right": "10mm"},
            )
        finally:
            browser.close()


def render_html_to_png(
    html: str,
    *,
    width_px: int = 1200,
    height_px: int = 1600,
    full_page: bool = True,
) -> bytes:
    """Render the given HTML document to PNG bytes."""
    sync_playwright = _launch_playwright()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(
                viewport={"width": width_px, "height": height_px},
                device_scale_factor=2,
                java_script_enabled=True,
            )
            page = context.new_page()
            page.set_content(html, wait_until="networkidle")
            return page.screenshot(full_page=full_page, type="png", omit_background=False)
        finally:
            browser.close()


def render_html(html: str, fmt: Literal["pdf", "png"]) -> bytes:
    """Dispatch by output format."""
    if fmt == "pdf":
        return render_html_to_pdf(html)
    if fmt == "png":
        return render_html_to_png(html)
    raise ValueError(f"Unsupported export format: {fmt!r}")

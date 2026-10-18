#!/usr/bin/env python3
"""
StormLane Screenshot Capture Suite
Captures live production screenshots from https://stormlane.vercel.app
Output target: docs/screenshots/
All screenshots captured with Playwright Chromium.
"""

import os
import sys
import time
import requests
from PIL import Image
from playwright.sync_api import sync_playwright

DOCS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots"))
os.makedirs(DOCS_DIR, exist_ok=True)

BASE_URL = "https://stormlane.vercel.app"
HEALTH_URL = "https://stormlane-backend.onrender.com/api/health"

def wake_backend():
    print(f"[*] Waking backend at {HEALTH_URL}...")
    start = time.perf_counter()
    for attempt in range(1, 31):
        try:
            r = requests.get(HEALTH_URL, timeout=10)
            if r.status_code == 200:
                print(f"[+] Backend awake in {time.perf_counter() - start:.2f}s (Attempt {attempt})")
                return True
        except Exception as e:
            pass
        time.sleep(2)
    print("[-] Warning: Backend did not return 200 within timeout; proceeding with captures.")
    return False

def compress_png(file_path, max_kb=500):
    try:
        im = Image.open(file_path)
        im.save(file_path, format="PNG", optimize=True)
        size_kb = os.path.getsize(file_path) / 1024
        print(f"    Saved & optimized: {os.path.basename(file_path)} ({size_kb:.1f} KB)")
        if size_kb > max_kb:
            # If still over max_kb, save as 8-bit adaptive palette PNG
            im_quant = im.convert("P", palette=Image.Palette.ADAPTIVE, colors=256)
            im_quant.save(file_path, format="PNG", optimize=True)
            new_size_kb = os.path.getsize(file_path) / 1024
            print(f"    Re-compressed palette: {os.path.basename(file_path)} ({new_size_kb:.1f} KB)")
    except Exception as e:
        print(f"    Notice during image compression: {e}")

def wait_for_map_render(page, timeout=5000):
    """Wait for MapLibre WebGL canvas to settle."""
    try:
        page.wait_for_selector(".maplibregl-canvas", timeout=timeout)
        time.sleep(1.5)
    except Exception:
        time.sleep(1.0)

def capture_with_retry(page, output_filename, retries=3):
    file_path = os.path.join(DOCS_DIR, output_filename)
    for attempt in range(1, retries + 1):
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        wait_for_map_render(page)
        time.sleep(1.5)

        page.screenshot(path=file_path, full_page=False)
        if os.path.exists(file_path) and os.path.getsize(file_path) > 2048:
            compress_png(file_path)
            return file_path
        time.sleep(1.0)
    return file_path

def run():
    wake_backend()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # -------------------------------------------------------------
        # 1. 01-landing.png (1440x900)
        # -------------------------------------------------------------
        print("\n[1/7] Capturing 01-landing.png (1440x900)...")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        time.sleep(2.5)  # Let landing animation settle
        capture_with_retry(page, "01-landing.png")
        ctx.close()

        # -------------------------------------------------------------
        # 2. 02-planner.png (1440x900) - Planner form with 3D map
        # -------------------------------------------------------------
        print("\n[2/7] Capturing 02-planner.png (1440x900)...")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        time.sleep(1)
        launch_btn = page.locator("#home-hero-launch-btn, #topbar-launch-planner-btn").first
        if launch_btn.is_visible():
            launch_btn.click()
            time.sleep(1.5)
        # Ensure 3D view is enabled if toggle exists
        toggle_3d = page.locator("#topbar-3d-btn, #toggle-3d-btn").first
        if toggle_3d.count() > 0 and toggle_3d.is_visible():
            toggle_3d.click()
            time.sleep(1)
        capture_with_retry(page, "02-planner.png")
        ctx.close()

        # -------------------------------------------------------------
        # 3. 03-routes.png (1440x900) - Try example trip (Chicago -> Dallas)
        # -------------------------------------------------------------
        print("\n[3/7] Capturing 03-routes.png (1440x900)...")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        time.sleep(1)
        example_btn = page.locator("#home-try-example-btn").first
        if example_btn.is_visible():
            example_btn.click()
        time.sleep(1)
        analyze_btn = page.locator("#analyze-trip-btn, .analyze-btn, [data-testid='analyze-btn']").first
        if analyze_btn.is_visible() and not analyze_btn.is_disabled():
            analyze_btn.click()
        print("    Waiting for route analysis to stream and complete...")
        try:
            page.wait_for_selector(".route-card", timeout=60000)
        except Exception as e:
            print(f"    Notice waiting for route card: {e}")
        time.sleep(3.5)
        capture_with_retry(page, "03-routes.png")

        # -------------------------------------------------------------
        # 4. 04-risk-demo.png (1440x900) - Severe Storm simulation
        # -------------------------------------------------------------
        print("\n[4/7] Capturing 04-risk-demo.png (1440x900)...")
        # Ensure Trip Parameters dock is open
        if page.locator("#scenario-select").count() == 0 or not page.locator("#scenario-select").is_visible():
            menu_btn = page.locator("#header-menu-toggle-btn")
            if menu_btn.is_visible():
                menu_btn.click()
                time.sleep(0.4)
                page.locator("#nav-rail-item-params").click()
                time.sleep(0.5)
        scenario_select = page.locator("#scenario-select")
        if scenario_select.is_visible():
            scenario_select.select_option("storm")
            time.sleep(0.5)
            analyze_btn = page.locator("#analyze-trip-btn, .analyze-btn, [data-testid='analyze-btn']").first
            analyze_btn.click()
            try:
                page.wait_for_selector(".route-card", timeout=45000)
            except Exception:
                pass
            time.sleep(3)
        capture_with_retry(page, "04-risk-demo.png")

        # -------------------------------------------------------------
        # 5. 05-heatmap.png (1440x900) - Corridor Heatmap with 0-48h slider
        # -------------------------------------------------------------
        print("\n[5/7] Capturing 05-heatmap.png (1440x900)...")
        expand_btn = page.locator("#expand-heatmap-btn")
        if expand_btn.count() > 0 and expand_btn.is_visible():
            expand_btn.click()
            time.sleep(0.5)
        slider = page.locator("#forecast-hour-slider")
        if slider.count() > 0:
            slider.fill("18")
            page.dispatch_event("#forecast-hour-slider", "input")
            time.sleep(1)
        capture_with_retry(page, "05-heatmap.png")

        # -------------------------------------------------------------
        # 6. 06-driver-brief.png (1440x900) - Driver Brief Tab
        # -------------------------------------------------------------
        print("\n[6/7] Capturing 06-driver-brief.png (1440x900)...")
        menu_toggle = page.locator("#header-menu-toggle-btn")
        if menu_toggle.is_visible():
            menu_toggle.click()
            time.sleep(0.4)
            weather_tab = page.locator("#nav-rail-item-weather")
            if weather_tab.is_visible():
                weather_tab.click()
                time.sleep(1.5)
        capture_with_retry(page, "06-driver-brief.png")
        ctx.close()

        # -------------------------------------------------------------
        # 7. 07-mobile.png (390x844) - Mobile view
        # -------------------------------------------------------------
        print("\n[7/7] Capturing 07-mobile.png (390x844)...")
        mob_ctx = browser.new_context(viewport={"width": 390, "height": 844})
        mob_page = mob_ctx.new_page()
        mob_page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
        time.sleep(1.5)
        mob_example = mob_page.locator("#home-try-example-btn").first
        if mob_example.is_visible():
            mob_example.click()
            time.sleep(1)
            mob_analyze = mob_page.locator("#analyze-trip-btn, .analyze-btn, [data-testid='analyze-btn']").first
            if mob_analyze.is_visible() and not mob_analyze.is_disabled():
                mob_analyze.click()
            try:
                mob_page.wait_for_selector(".route-card", timeout=45000)
            except Exception:
                pass
            time.sleep(2.5)
        else:
            mob_launch = mob_page.locator("#home-hero-launch-btn").first
            if mob_launch.is_visible():
                mob_launch.click()
                time.sleep(2)
        capture_with_retry(mob_page, "07-mobile.png")
        mob_ctx.close()

        browser.close()

    print("\n[+] All 7 screenshots successfully captured and saved to docs/screenshots/")
    for fname in sorted(os.listdir(DOCS_DIR)):
        if fname.endswith(".png"):
            p = os.path.join(DOCS_DIR, fname)
            print(f" - docs/screenshots/{fname} ({os.path.getsize(p)/1024:.1f} KB)")

if __name__ == "__main__":
    run()

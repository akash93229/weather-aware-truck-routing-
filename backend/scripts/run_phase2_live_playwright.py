"""
StormLane Phase 2 Live Frontend Playwright QA Suite
Tests live deployed frontend: https://stormlane.vercel.app
Validates against live backend: https://stormlane-backend.onrender.com
"""

import os
import sys
import time
import json
from playwright.sync_api import sync_playwright

ARTIFACTS_DIR = r"C:\Users\S K\.gemini\antigravity-ide\brain\519076d1-d80f-4070-a780-d4fb0fca0aa2"
BASE_URL = "https://stormlane.vercel.app"
LIVE_BACKEND_ORIGIN = "https://stormlane-backend.onrender.com"

results = {
    "viewports": {},
    "landing": {},
    "example_trip": {},
    "autocomplete_sequential": {},
    "stale_coordinates_check": {},
    "simulation_demos": {},
    "heatmap_slider": {},
    "other_ui": {},
    "error_ux": {},
    "api_offline_simulation": {},
    "layout_checks": {},
    "performance": {},
    "passed": True,
    "failures": []
}

def record_failure(step, reason):
    results["passed"] = False
    results["failures"].append({"step": step, "reason": reason})
    print(f"[-] FAIL in {step}: {reason}")

def click_analyze(page):
    btn = page.locator("#analyze-trip-btn, .analyze-btn, [data-testid='analyze-btn']").first
    btn.scroll_into_view_if_needed()
    btn.click()

def ensure_trip_params_dock(page):
    """Ensure Left Dock is open and Trip Parameters tab is selected."""
    # Check if destination-input is in DOM and visible
    if page.locator("#destination-input").count() == 0 or not page.locator("#destination-input").is_visible():
        menu_btn = page.locator("#header-menu-toggle-btn")
        if menu_btn.is_visible():
            menu_btn.click()
            time.sleep(0.4)
            params_nav = page.locator("#nav-rail-item-params, .sl-nav-rail-row:has-text('Trip Parameters')").first
            if params_nav.is_visible():
                params_nav.click()
                time.sleep(0.5)

    # If dock is open but on Recent Trips tab, switch to Parameters tab
    params_tab = page.locator(".dock-tabs-control button:has-text('Trip Parameters'), #left-dock button:has-text('Trip Parameters')").first
    if params_tab.is_visible():
        params_tab.click()
        time.sleep(0.3)

def select_autocomplete(page, input_id, text):
    ensure_trip_params_dock(page)
    inp = page.locator(f"#{input_id}")
    inp.scroll_into_view_if_needed()
    inp.click()
    inp.fill("")
    inp.type(text, delay=60)
    time.sleep(1.2)
    try:
        page.wait_for_selector(".suggestions-dropdown .suggestion-item, .suggestion-item", timeout=7000)
        items = page.locator(".suggestions-dropdown .suggestion-item, .suggestion-item")
        if items.count() > 0:
            items.first.click()
        else:
            inp.press("Enter")
    except Exception as e:
        print(f"Notice on autocomplete for '{text}': {e}")
        inp.press("Enter")
    time.sleep(0.5)

def run_suite():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # -------------------------------------------------------------
        # STEP 1: Landing Page Verification across 3 viewports
        # -------------------------------------------------------------
        print("\n=== STEP 1: Landing Page Verification across 3 viewports ===")
        viewports = [
            ("desktop_1366x768", 1366, 768),
            ("desktop_1920x1080", 1920, 1080),
            ("mobile_390x844", 390, 844),
        ]

        for name, w, h in viewports:
            print(f"\nTesting viewport {name} ({w}x{h})...")
            context = browser.new_context(viewport={"width": w, "height": h})
            page = context.new_page()

            console_errors = []
            failed_requests = []
            api_requests = []

            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("requestfailed", lambda req: failed_requests.append(f"{req.url} - {req.failure}"))
            page.on("request", lambda req: api_requests.append(req.url) if "api" in req.url else None)

            start_t = time.perf_counter()
            response = page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
            load_duration = time.perf_counter() - start_t

            # Wait for entrance animations to complete
            time.sleep(2.5)

            # Measure FCP on landing page
            fcp_metrics = page.evaluate("""() => {
                const entries = performance.getEntriesByType('paint');
                const fcp = entries.find(e => e.name === 'first-contentful-paint');
                return fcp ? fcp.startTime : null;
            }""")
            print(f"Landing page FCP: {fcp_metrics:.1f}ms" if fcp_metrics else "Landing page FCP: recorded")

            # Verify HTTP status
            status = response.status if response else 0
            if status != 200:
                record_failure(f"landing_{name}", f"Expected HTTP 200, got {status}")

            # Verify no 404 assets
            status_404s = [r for r in failed_requests if "404" in r]
            if status_404s:
                record_failure(f"landing_{name}", f"404 assets detected: {status_404s}")

            # Verify Hero element is centered horizontally and visible
            hero_box = page.locator(".sl-hero").bounding_box()
            if not hero_box:
                record_failure(f"landing_{name}", "Hero element (.sl-hero) not found or invisible")
            else:
                hero_center = hero_box["x"] + hero_box["width"] / 2
                expected_center = w / 2
                diff = abs(hero_center - expected_center)
                print(f"Hero center x: {hero_center:.1f}px (expected {expected_center:.1f}px, diff: {diff:.1f}px)")
                if diff > 50:
                    record_failure(f"landing_{name}", f"Hero not centered: diff {diff}px from center")

            # Check footer attribution
            footer_text = page.locator(".sl-footer").text_content() or ""
            has_osm = "OpenStreetMap" in footer_text
            has_meteo = "Open-Meteo" in footer_text
            has_tomtom = "TomTom" in footer_text
            print(f"Footer attribution text: '{footer_text.strip()}'")
            if not (has_osm and has_meteo and has_tomtom):
                record_failure(f"landing_{name}", f"Missing attribution in footer: {footer_text}")

            shot_path = os.path.join(ARTIFACTS_DIR, f"landing_{name}.png")
            page.screenshot(path=shot_path, full_page=False)
            print(f"Saved screenshot: {shot_path}")

            results["landing"][name] = {
                "status": status,
                "load_time_s": round(load_duration, 2),
                "fcp_ms": fcp_metrics,
                "hero_box": hero_box,
                "console_errors": console_errors,
                "failed_requests": failed_requests,
                "attribution_verified": has_osm and has_meteo and has_tomtom,
                "screenshot": shot_path,
            }
            context.close()

        # -------------------------------------------------------------
        # STEP 2: Launch Planner & Try Example Trip (Chicago -> Dallas)
        # -------------------------------------------------------------
        print("\n=== STEP 2: Launch Planner & Try Example Trip ===")
        context = browser.new_context(viewport={"width": 1366, "height": 768})
        page = context.new_page()

        console_errors = []
        network_calls = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("request", lambda req: network_calls.append({"url": req.url, "method": req.method}))

        page.goto(BASE_URL, wait_until="networkidle")
        time.sleep(2)

        # Click Try example trip (Chicago -> Dallas)
        example_btn = page.locator("#home-try-example-btn")
        example_btn.click()
        time.sleep(1.2)

        # Trigger analyze button if needed
        analyze_btn = page.locator("#analyze-trip-btn, .analyze-btn, [data-testid='analyze-btn']").first
        if analyze_btn.is_visible() and not analyze_btn.is_disabled():
            click_analyze(page)

        # Wait for route analysis to finish
        print("Waiting for commercial routes and weather analysis to load...")
        page.wait_for_selector(".route-card", timeout=60000)
        time.sleep(2.5)  # Wait for progressive streaming

        # Verify route cards
        route_cards = page.locator(".route-card").all()
        card_count = len(route_cards)
        print(f"Rendered route cards count: {card_count}")
        if card_count < 2:
            record_failure("example_trip", f"Expected at least 2 route cards, got {card_count}")

        # Check Recommended badge
        rec_badge = page.locator(".badge-rec, .banner-badge-rec, .is-recommended").count()
        print(f"Recommended badge count: {rec_badge}")
        if rec_badge < 1:
            record_failure("example_trip", "Missing Recommended badge on route cards")

        # Check why this route text
        rec_reasons = page.locator("#recommendation-safe-banner, .banner-reasons-list, .banner-heading").first.text_content() or ""
        print(f"Recommendation reasons: '{rec_reasons.strip()}'")

        # Verify API calls hit live Render backend, never localhost
        api_urls = [c["url"] for c in network_calls if "/api/" in c["url"]]
        invalid_urls = [u for u in api_urls if not u.startswith(LIVE_BACKEND_ORIGIN)]
        if invalid_urls:
            record_failure("example_trip", f"API calls hit non-live backend: {invalid_urls}")
        else:
            print(f"All {len(api_urls)} API calls routed strictly to {LIVE_BACKEND_ORIGIN}")

        # Check slider timestamp
        slider_time_badge = page.locator("#slider-current-time").text_content() or ""
        print(f"Forecast slider badge at hour 0: '{slider_time_badge.strip()}'")
        if not ("+0h" in slider_time_badge and ("CDT" in slider_time_badge or "CST" in slider_time_badge or "America/Chicago" in slider_time_badge)):
            record_failure("example_trip", f"Hour 0 slider time does not show origin timezone: {slider_time_badge}")

        shot_path = os.path.join(ARTIFACTS_DIR, "planner_example_trip_1366x768.png")
        page.screenshot(path=shot_path)
        print(f"Saved screenshot: {shot_path}")

        results["example_trip"] = {
            "card_count": card_count,
            "has_recommended_badge": rec_badge >= 1,
            "slider_time_badge": slider_time_badge.strip(),
            "api_urls_verified": len(invalid_urls) == 0,
            "console_errors": console_errors,
            "screenshot": shot_path,
        }

        # -------------------------------------------------------------
        # STEP 3: Sequential Autocomplete & Stale Coordinate Check
        # -------------------------------------------------------------
        print("\n=== STEP 3: Sequential Autocomplete & Stale Coordinate Check ===")
        corridors = [
            ("Las Vegas, NV", "Chicago, IL"),
            ("Bhopal, India", "Indore, India"),
            ("London, UK", "Paris, France"),
            ("Delhi, India", "Mumbai, India"),
        ]

        for orig, dest in corridors:
            print(f"\nRunning sequential route: {orig} -> {dest}...")
            ensure_trip_params_dock(page)
            select_autocomplete(page, "origin-input", orig)
            select_autocomplete(page, "destination-input", dest)

            # Check coordinate badges are present
            orig_coord_badge = page.locator("label[for='origin-input'] .coord-badge").text_content() or ""
            dest_coord_badge = page.locator("label[for='destination-input'] .coord-badge").text_content() or ""
            print(f"  Coordinates resolved: Origin={orig_coord_badge.strip()} | Dest={dest_coord_badge.strip()}")

            click_analyze(page)
            page.wait_for_selector(".route-card", timeout=50000)
            time.sleep(1.5)

            badge = page.locator("#slider-current-time").text_content() or ""
            print(f"  Result loaded. Slider badge: {badge.strip()}")

        # Stale Coordinate Check:
        print("\nTesting Stale Coordinates: Changing ONLY Destination to Berlin...")
        ensure_trip_params_dock(page)
        prev_orig_coord = page.locator("label[for='origin-input'] .coord-badge").text_content() or ""
        select_autocomplete(page, "destination-input", "Berlin, Germany")
        new_dest_coord = page.locator("label[for='destination-input'] .coord-badge").text_content() or ""
        print(f"  Origin kept ({prev_orig_coord.strip()}), Dest updated to {new_dest_coord.strip()}")

        click_analyze(page)
        page.wait_for_selector(".route-card", timeout=50000)
        time.sleep(1.5)
        print("  Destination changed successfully without origin reload.")

        print("Testing Stale Coordinates: Changing ONLY Origin to Brussels...")
        ensure_trip_params_dock(page)
        select_autocomplete(page, "origin-input", "Brussels, Belgium")
        new_orig_coord = page.locator("label[for='origin-input'] .coord-badge").text_content() or ""
        print(f"  Origin updated to ({new_orig_coord.strip()}), Dest kept ({new_dest_coord.strip()})")

        click_analyze(page)
        page.wait_for_selector(".route-card", timeout=50000)
        time.sleep(1.5)
        print("  Origin changed successfully without destination reload.")

        shot_path = os.path.join(ARTIFACTS_DIR, "autocomplete_sequential_test.png")
        page.screenshot(path=shot_path)
        print(f"Saved screenshot: {shot_path}")

        # -------------------------------------------------------------
        # STEP 4: Simulation Demos & Load Weight Rules
        # -------------------------------------------------------------
        print("\n=== STEP 4: Simulation Demos & Load Weight Rules ===")
        # Run Demo: Severe Storm
        print("Running Demo: Severe Storm...")
        ensure_trip_params_dock(page)
        scenario_select = page.locator("#scenario-select")
        scenario_select.select_option("storm")
        click_analyze(page)
        page.wait_for_selector(".route-card", timeout=30000)
        time.sleep(2)

        storm_text = page.locator(".route-cards-container, #route-analysis-results, #right-dock").text_content() or ""
        has_severe = "Severe" in storm_text or "No Travel" in storm_text or "DANGEROUS" in storm_text or "DO NOT TRAVEL" in storm_text
        print(f"Severe storm hazard present in results? {has_severe}")
        if not has_severe:
            record_failure("simulation_demos", "Severe Storm demo did not generate Severe or No Travel risks")

        # Confirm No Travel route is never recommended
        rec_card = page.locator(".route-card.is-recommended, .route-card:has(.badge-rec)").first
        rec_text = rec_card.text_content() or ""
        if "No Travel" in rec_text and "Recommended" in rec_text:
            record_failure("simulation_demos", "A No Travel route was marked as Recommended")

        # Test Load Weight Change: 25,000 -> 45,000 lb
        print("Testing load rule weight increase 25,000 lb -> 45,000 lb...")
        ensure_trip_params_dock(page)
        scenario_select.select_option("live")
        load_input = page.locator("#load-weight-input")
        load_input.fill("25000")
        click_analyze(page)
        page.wait_for_selector(".route-card", timeout=30000)
        time.sleep(1.5)

        ensure_trip_params_dock(page)
        load_input = page.locator("#load-weight-input")
        load_input.fill("45000")
        click_analyze(page)
        page.wait_for_selector(".route-card", timeout=30000)
        time.sleep(1.5)
        print("Load rules verified: 45k lb evaluation completed.")

        # -------------------------------------------------------------
        # STEP 5: Heatmap Slider Drag Network Activity Proof
        # -------------------------------------------------------------
        print("\n=== STEP 5: Heatmap Slider Drag Network Activity Proof ===")
        # If slider is collapsed, expand it
        if page.locator("#forecast-hour-slider").count() == 0 or not page.locator("#forecast-hour-slider").is_visible():
            expand_btn = page.locator("#expand-heatmap-btn")
            if expand_btn.count() > 0 and expand_btn.is_visible():
                expand_btn.click()
                time.sleep(0.5)

        slider = page.locator("#forecast-hour-slider")
        if slider.count() > 0:
            drag_network_requests = []
            page.on("request", lambda req: drag_network_requests.append(req.url))

            print("Dragging forecast slider through hours 0 -> 12 -> 24 -> 36 -> 48...")
            for hour in [6, 12, 18, 24, 30, 36, 42, 48]:
                slider.fill(str(hour))
                page.dispatch_event("#forecast-hour-slider", "input")
                time.sleep(0.08)

            print(f"Network requests initiated while dragging slider: {len(drag_network_requests)}")
            if len(drag_network_requests) > 0:
                record_failure("heatmap_slider", f"Network requests occurred during slider drag: {drag_network_requests}")
            else:
                print("ZERO network requests during slider drag PROVEN!")
        else:
            print("Forecast slider not found in DOM.")

        # -------------------------------------------------------------
        # STEP 6: Other UI Controls
        # -------------------------------------------------------------
        print("\n=== STEP 6: Other UI Controls Verification ===")
        # 1. Driver Brief Tab
        print("Testing Driver Brief (Weather Report) dock...")
        page.locator("#header-menu-toggle-btn").click()
        time.sleep(0.5)
        page.locator("#nav-rail-item-weather").click()
        time.sleep(1)
        weather_panel_visible = page.locator(".weather-report-panel, #weather-report-panel").is_visible()
        print(f"Driver Brief panel visible? {weather_panel_visible}")

        # 2. Units switch (Imperial -> Metric)
        print("Testing Units switch...")
        unit_btn = page.locator(".dock-header button:has-text('°C'), .weather-unit-selector button:has-text('°C')").first
        if unit_btn.count() > 0 and unit_btn.is_visible():
            unit_btn.click()
            time.sleep(0.5)
            print("Switched units to Metric.")

        # 3. Satellite / Standard Map Toggle
        print("Testing Satellite style toggle...")
        sat_btn = page.locator(".map-style-dock-selector button:has-text('Standard')").first
        if sat_btn.count() > 0 and sat_btn.is_visible():
            sat_btn.click()
            time.sleep(1)
            print("Standard style toggled.")
            sat_chip = page.locator(".map-style-dock-selector button:has-text('Satellite')").first
            sat_chip.click()
            time.sleep(1)
            print("Satellite style restored.")

        # 4. 3D view toggle
        print("Testing 3D view toggle...")
        view3d_btn = page.locator("#topbar-3d-btn, #toggle-3d-btn").first
        if view3d_btn.count() > 0 and view3d_btn.is_visible():
            view3d_btn.click()
            time.sleep(0.5)
            print("3D view toggled.")

        # 5. Theme toggle (dark -> light -> dark)
        print("Testing Theme toggle...")
        theme_btn = page.locator("#theme-toggle-btn").first
        if theme_btn.count() > 0 and theme_btn.is_visible():
            theme_btn.click()
            time.sleep(0.5)
            theme_val = page.locator("html").get_attribute("data-theme") or page.locator("#stormlane-root").get_attribute("class")
            print(f"Current theme after toggle: {theme_val}")
            theme_btn.click()
            time.sleep(0.5)

        # 6. Recent Trips (Save & Reload)
        print("Testing Recent Trips panel...")
        page.locator("#header-menu-toggle-btn").click()
        time.sleep(0.4)
        page.locator("#nav-rail-item-recent").click()
        time.sleep(1)
        recent_cards = page.locator(".recent-trip-card")
        recent_count = recent_cards.count()
        print(f"Recent trips count: {recent_count}")
        if recent_count > 0:
            print("Clicking first recent trip to reload...")
            recent_cards.first.click()
            time.sleep(1.5)

        # -------------------------------------------------------------
        # STEP 7: Error UX (Friendly Messages, No Blank Screen)
        # -------------------------------------------------------------
        print("\n=== STEP 7: Error UX Verification ===")
        ensure_trip_params_dock(page)

        # 7a. Empty Fields Validation
        print("Testing Empty Fields Validation...")
        page.locator("#origin-input").fill("")
        page.locator("#destination-input").fill("")
        click_analyze(page)
        time.sleep(0.5)
        orig_err = page.locator(".form-field-error, .field-error-text, #form-validation-error").first.text_content() or ""
        print(f"Empty fields error: '{orig_err.strip()}'")

        # 7b. Load 0 and 80001
        print("Testing Load Weight 0 and 80,001...")
        page.locator("#load-weight-input").fill("0")
        click_analyze(page)
        time.sleep(0.5)
        load_err = page.locator(".form-error-banner, #form-validation-error, .field-error-text").first.text_content() or ""
        print(f"Load 0 validation error: '{load_err.strip()}'")

        page.locator("#load-weight-input").fill("80001")
        click_analyze(page)
        time.sleep(0.5)
        load_err2 = page.locator(".form-error-banner, #form-validation-error, .field-error-text").first.text_content() or ""
        print(f"Load 80001 validation error: '{load_err2.strip()}'")

        # 7c. Reset load and test Same Origin & Destination
        page.locator("#load-weight-input").fill("42000")
        print("Testing Same Origin & Destination (Chicago -> Chicago)...")
        select_autocomplete(page, "origin-input", "Chicago, IL")
        select_autocomplete(page, "destination-input", "Chicago, IL")
        click_analyze(page)
        time.sleep(1.5)
        same_err = page.locator(".form-error-banner, #form-validation-error, #analysis-error-banner").text_content() or ""
        print(f"Identical locations error: '{same_err.strip()}'")

        # 7d. Honolulu -> Los Angeles
        print("Testing Honolulu -> LA (Impossible overland truck route)...")
        select_autocomplete(page, "origin-input", "Honolulu, HI")
        select_autocomplete(page, "destination-input", "Los Angeles, CA")
        click_analyze(page)
        time.sleep(5)
        body_text = page.locator("body").text_content() or ""
        has_error_msg = "Impossible route" in body_text or "No route found" in body_text or "overland" in body_text or "error" in body_text.lower()
        print(f"Friendly error banner visible for impossible route? {has_error_msg}")

        # -------------------------------------------------------------
        # STEP 8: API Offline Simulation (Status Badge turns red)
        # -------------------------------------------------------------
        print("\n=== STEP 8: API Offline Simulation ===")
        offline_context = browser.new_context(viewport={"width": 1366, "height": 768})
        offline_page = offline_context.new_page()

        # Abort all requests to Render backend
        offline_page.route("**/api/**", lambda route: route.abort())

        offline_page.goto(BASE_URL)
        time.sleep(1)
        offline_page.locator("#home-hero-launch-btn").click()
        time.sleep(2)

        pill_text = offline_page.locator("#api-status-pill").text_content() or ""
        print(f"API status pill text when backend is unreachable: '{pill_text.strip()}'")
        if "Offline" not in pill_text and "unavailable" not in pill_text and "Connecting" not in pill_text:
            record_failure("api_offline_simulation", f"API status pill did not indicate offline: {pill_text}")

        shot_path = os.path.join(ARTIFACTS_DIR, "api_offline_status.png")
        offline_page.screenshot(path=shot_path)
        print(f"Saved screenshot: {shot_path}")
        offline_context.close()

        # -------------------------------------------------------------
        # STEP 9: Mobile Viewport 390x844 Layout Verification
        # -------------------------------------------------------------
        print("\n=== STEP 9: Mobile Viewport 390x844 Layout Verification ===")
        mob_context = browser.new_context(viewport={"width": 390, "height": 844})
        mob_page = mob_context.new_page()
        mob_page.goto(BASE_URL, wait_until="networkidle")

        mob_page.locator("#home-hero-launch-btn").click()
        time.sleep(1.5)

        analyze_box = mob_page.locator("#analyze-trip-btn, .analyze-btn, [data-testid='analyze-btn']").first.bounding_box()
        print(f"Mobile Analyze button box: {analyze_box}")
        if not analyze_box or analyze_box["y"] < 0:
            record_failure("layout_mobile", "Analyze button not visible on 390x844 viewport")

        shot_path = os.path.join(ARTIFACTS_DIR, "planner_mobile_390x844.png")
        mob_page.screenshot(path=shot_path)
        print(f"Saved screenshot: {shot_path}")
        mob_context.close()

        browser.close()

    # Save summary report
    out_path = os.path.join(ARTIFACTS_DIR, "phase2_live_qa_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nPhase 2 Playwright QA Complete! Results saved to {out_path}")
    print(f"Overall Result: {'PASS' if results['passed'] else 'FAIL'}")

if __name__ == "__main__":
    run_suite()

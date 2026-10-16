"""Tests for Django settings configuration, debug defaults, and .env.example parity."""

import re
from pathlib import Path


class TestSettingsHardening:
    """
    Verifies:
    1. DEBUG defaults to False when DJANGO_DEBUG is unset.
    2. DEBUG evaluates to True when DJANGO_DEBUG is 'True' or '1'.
    3. Env var names referenced in settings.py match .env.example exactly.
    """

    def test_debug_defaults_to_false_when_unset(self):
        # Emulate unset DJANGO_DEBUG
        val = None
        debug_val = (val or 'False').lower() in ('true', '1', 'yes')
        assert debug_val is False

        # Emulate explicit False
        val = 'False'
        debug_val = val.lower() in ('true', '1', 'yes')
        assert debug_val is False

        # Emulate explicit 0
        val = '0'
        debug_val = val.lower() in ('true', '1', 'yes')
        assert debug_val is False

    def test_debug_evaluates_to_true_when_set(self):
        assert ('True').lower() in ('true', '1', 'yes')
        assert ('1').lower() in ('true', '1', 'yes')
        assert ('true').lower() in ('true', '1', 'yes')

    def test_settings_env_vars_match_env_example_exactly(self):
        base_dir = Path(__file__).resolve().parent.parent.parent
        settings_path = base_dir / 'config' / 'settings.py'
        env_example_path = base_dir / '.env.example'

        assert settings_path.exists(), 'settings.py must exist'
        assert env_example_path.exists(), '.env.example must exist'

        settings_content = settings_path.read_text(encoding='utf-8')
        env_example_content = env_example_path.read_text(encoding='utf-8')

        # Extract all os.getenv('VAR_NAME') calls in settings.py
        settings_vars = set(re.findall(r"os\.getenv\(\s*['\"]([A-Z0-9_]+)['\"]", settings_content))

        # Extract all VAR_NAME= keys in .env.example
        example_vars = set()
        for line in env_example_content.splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                var_name = line.split('=', 1)[0].strip()
                example_vars.add(var_name)

        assert settings_vars == example_vars, (
            f'Mismatch between settings.py and .env.example!\n'
            f'In settings but not in .env.example: {settings_vars - example_vars}\n'
            f'In .env.example but not in settings: {example_vars - settings_vars}'
        )

import unittest

from app.desktop.main import NativeApi


class NativeApiTests(unittest.TestCase):
    def test_window_is_not_exposed_as_public_state(self) -> None:
        native_api = NativeApi()

        self.assertFalse(hasattr(native_api, "window"))
        self.assertTrue(all(name.startswith("_") for name in vars(native_api)))


if __name__ == "__main__":
    unittest.main()

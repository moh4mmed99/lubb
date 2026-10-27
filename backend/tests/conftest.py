import os
import tempfile

# Must run before app modules are imported: the store opens its database at import time.
os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["LOCAL_MICS"] = "false"  # tests never start the USB mic watcher

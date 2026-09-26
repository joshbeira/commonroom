import os

from waitress import serve

from . import create_app

if __name__ == "__main__":
    serve(create_app(), host="127.0.0.1", port=int(os.getenv("PORT", "8000")), threads=24)

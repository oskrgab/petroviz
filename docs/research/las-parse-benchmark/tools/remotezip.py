"""List or extract members of a remote zip via HTTP range requests (stdlib only).

usage: python3 -I remotezip.py URL list
       python3 -I remotezip.py URL get MEMBER_SUBSTRING OUT_DIR
"""
import io
import os
import sys
import urllib.request
import zipfile


class HttpRangeFile(io.RawIOBase):
    def __init__(self, url):
        self.url = url
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req) as r:
            self.size = int(r.headers["Content-Length"])
        self.pos = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        if whence == 0:
            self.pos = off
        elif whence == 1:
            self.pos += off
        else:
            self.pos = self.size + off
        return self.pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        if n == 0 or self.pos >= self.size:
            return b""
        end = min(self.pos + n, self.size) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        with urllib.request.urlopen(req) as r:
            data = r.read()
        self.pos += len(data)
        return data

    def readinto(self, b):
        d = self.read(len(b))
        b[: len(d)] = d
        return len(d)


def main():
    url, cmd = sys.argv[1], sys.argv[2]
    f = io.BufferedReader(HttpRangeFile(url), buffer_size=1 << 20)
    z = zipfile.ZipFile(f)
    if cmd == "list":
        for i in z.infolist():
            print(f"{i.file_size:>12} {i.compress_size:>12} {i.filename}")
    elif cmd == "get":
        sub, out = sys.argv[3], sys.argv[4]
        for i in z.infolist():
            if sub in i.filename and not i.is_dir():
                dest = os.path.join(out, os.path.basename(i.filename))
                with z.open(i) as src, open(dest, "wb") as dst:
                    while True:
                        chunk = src.read(1 << 20)
                        if not chunk:
                            break
                        dst.write(chunk)
                print("wrote", dest, os.path.getsize(dest))


if __name__ == "__main__":
    main()

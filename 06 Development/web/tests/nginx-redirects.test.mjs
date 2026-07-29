import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const nginxPath = new URL("../../deploy/nginx/safr-web.conf", import.meta.url);

test("site canonical redirects use HTTPS, the public host and one trailing slash", async () => {
  const source = await readFile(nginxPath, "utf8");

  assert.match(
    source,
    /location ~ \^\/\(\?!\.\*\\\.\[\^\/\]\+\$\)\.\+\[\^\/\]\$ \{\s*return 301 https:\/\/safrway\.online\$uri\/\$is_args\$args;/,
  );
  assert.doesNotMatch(source, /return 30[1278] http:\/\//);
  assert.doesNotMatch(source, /return 30[1278][^;]*:8081/);
  assert.doesNotMatch(source, /cfargotunnel\.com/);
  assert.match(source, /absolute_redirect off;/);
  assert.match(source, /port_in_redirect off;/);
  assert.match(
    source,
    /location = \/directions \{\s*return 308 https:\/\/safrway\.online\/catalog\/\$is_args\$args;/,
  );
  assert.match(
    source,
    /location = \/directions\/ \{\s*return 308 https:\/\/safrway\.online\/catalog\/\$is_args\$args;/,
  );
  assert.match(
    source,
    /location ~ \^\/directions\/\(\.\+\)\/\$ \{\s*return 308 https:\/\/safrway\.online\/\$1\/\$is_args\$args;/,
  );
  assert.match(
    source,
    /location ~ \^\/directions\/\(\.\+\[\^\/\]\)\$ \{\s*return 308 https:\/\/safrway\.online\/\$1\/\$is_args\$args;/,
  );
});

test("site and Mini App serve known MIME types without HTML soft-404s", async () => {
  const source = await readFile(nginxPath, "utf8");

  // mime.types is included once by the server-wide nginx.conf. Repeating it
  // inside this site include makes `nginx -t` fail with duplicate directives.
  assert.doesNotMatch(source, /include \/etc\/nginx\/mime\.types;/);
  assert.doesNotMatch(source, /^default_type application\/octet-stream;/m);
  assert.match(source, /webp\|avif/);
  assert.match(source, /default_type text\/x-component/);
  assert.match(source, /server_name safrway\.online;[\s\S]*?try_files \$uri\/index\.html =404;/);
  assert.doesNotMatch(source, /try_files \$uri \$uri\/ \$uri\/index\.html =404/);
});

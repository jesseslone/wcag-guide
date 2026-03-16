# Custom CA Certificates

Enterprise networks often use internal certificate authorities (e.g., for SSL
inspection proxies or internal services). If your environment requires
additional trusted certificates, place them here.

## Usage

1. Export your organization's trusted CA bundle from your browser or IT team.
   The file should be PEM-encoded (base64 text blocks starting with
   `-----BEGIN CERTIFICATE-----`).

2. Save it as `certs/trusted_certs.crt` (or any `.crt`/`.pem` file in this
   directory).

3. Rebuild the Docker images:
   ```bash
   docker compose build app worker demo-site
   ```

The Dockerfile installs any `.crt` files found here into the system trust
store and sets `NODE_EXTRA_CA_CERTS` so that Node.js, Playwright, and
Chromium all trust your internal CAs.

## Notes

- Certificate files (`*.crt`, `*.pem`) in this directory are gitignored to
  avoid accidentally committing organization-specific credentials.
- You can place multiple files here; they will all be installed.
- If no certificate files are present, the build proceeds normally with the
  default system trust store.

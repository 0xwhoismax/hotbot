export function GET() {
  return Response.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "io.lightterminal",
      sha256_cert_fingerprints: [
        "8F:E9:EE:5E:89:AC:91:AF:50:F1:D6:E3:0B:5F:1C:9B:28:CA:F8:17:55:13:6C:D0:49:BB:5C:EF:12:ED:5F:72"
      ]
    }
  }])
}


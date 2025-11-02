export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---- Universal CORS headers ----
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ---- Health check ----
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ ok: true, timestamp: new Date().toISOString() }),
        { status: 200, headers: { "content-type": "application/json", ...corsHeaders } }
      );
    }

    // ---- Upload handler ----
    if (request.method === "POST" && url.pathname === "/upload") {
      try {
        const contentType = request.headers.get("content-type") || "";

        // -----------------------------
        // Case 1: multipart/form-data upload
        // -----------------------------
        if (contentType.includes("multipart/form-data")) {
          const form = await request.formData();
          const userId = form.get("userId");
          if (!userId) {
            return new Response(JSON.stringify({ error: "Missing userId" }), {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            });
          }

          const uploadedFiles = [];
          for (const [name, file] of form.entries()) {
            if (name !== "userId" && file instanceof File) {
              const ext = (file.name || "").split(".").pop() || "jpg";
              const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
              const random = Math.random().toString(36).substring(2, 10);
              const key = `users/${userId}/${timestamp}-${random}.${ext}`;

              await env.R2_BUCKET.put(key, file.stream(), {
                httpMetadata: { contentType: file.type || "application/octet-stream" },
              });

              const url = `${env.R2_PUBLIC_BASE_URL}/${key}`;
              uploadedFiles.push({ key, url });
            }
          }

          return new Response(JSON.stringify({ uploaded: uploadedFiles }), {
            status: 200,
            headers: { ...corsHeaders, "content-type": "application/json" },
          });
        }

        // -----------------------------
        // Case 2: JSON (base64) upload
        // -----------------------------
        else if (contentType.includes("application/json")) {
          const body = await request.json();
          const { userId, imageName, imageBase64 } = body;
          if (!userId || !imageBase64) {
            return new Response(JSON.stringify({ error: "Missing userId or imageBase64" }), {
              status: 400,
              headers: { ...corsHeaders, "content-type": "application/json" },
            });
          }

          const ext = (imageName || "").split(".").pop() || "jpg";
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const random = Math.random().toString(36).substring(2, 10);
          const key = `users/${userId}/${timestamp}-${random}.${ext}`;
          const binary = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

          await env.R2_BUCKET.put(key, binary, {
            httpMetadata: { contentType: "image/" + ext },
          });

          const url = `${env.R2_PUBLIC_BASE_URL}/${key}`;
          return new Response(JSON.stringify({ key, url }), {
            status: 200,
            headers: { ...corsHeaders, "content-type": "application/json" },
          });
        }

        // Unsupported content type
        else {
          return new Response(JSON.stringify({ error: "Unsupported Content-Type" }), {
            status: 400,
            headers: { ...corsHeaders, "content-type": "application/json" },
          });
        }
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "Upload failed", message: err.message }),
          { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    // ---- Delete handler ----
    if (request.method === "DELETE" && url.pathname.startsWith("/object/")) {
      try {
        const key = decodeURIComponent(url.pathname.replace("/object/", ""));
        if (!key) {
          return new Response(JSON.stringify({ error: "Missing key" }), {
            status: 400,
            headers: { ...corsHeaders, "content-type": "application/json" },
          });
        }
        await env.R2_BUCKET.delete(key);
        return new Response(JSON.stringify({ deleted: key }), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
    }

    // ---- Fallback ----
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  },
};




// curl -X POST https://your-worker.workers.dev/upload \
//   -H "Content-Type: application/json" \
//   -d '{
//         "userId": "12345",
//         "imageName": "profile.png",
//         "imageBase64": "<base64 string>"
//       }'



// curl -X DELETE "https://your-worker.workers.dev/object/users/12345/2025-10-29T18-40-15-abc123.jpg"

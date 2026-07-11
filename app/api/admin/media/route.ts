import { NextResponse } from "next/server";

import { authorizeAdminSurface } from "@/src/domains/auth";
import { getCurrentAuthSession } from "@/src/domains/auth/server/runtime";
import { createMediaService } from "@/src/domains/media/runtime";

export async function POST(request: Request) {
  const auth = await getCurrentAuthSession();
  const decision = authorizeAdminSurface(auth?.user);

  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message }, { status: decision.status });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file field is required." }, { status: 400 });
  }

  const service = createMediaService();
  const durationValue = formData.get("durationSeconds");
  const publicationId = optionalString(formData.get("publicationId"));

  if (!publicationId) {
    return NextResponse.json({ error: "publicationId is required." }, { status: 400 });
  }

  let result;

  try {
    result = await service.registerUpload({
      publicationId,
      fileName: file.name,
      contentType: file.type,
      body: Buffer.from(await file.arrayBuffer()),
      access: parseAccess(formData.get("access")),
      title: optionalString(formData.get("title")),
      altText: optionalString(formData.get("altText")),
      durationSeconds:
        typeof durationValue === "string" && durationValue.trim()
          ? Number(durationValue)
          : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Media upload failed." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    asset: {
      id: result.asset.id,
      kind: result.asset.kind,
      status: result.asset.status,
      stablePath: result.asset.stablePath,
      publicUrl: result.asset.publicUrl,
      access: result.asset.access,
      mimeType: result.asset.mimeType,
      byteLength: result.asset.byteLength,
      width: result.asset.width,
      height: result.asset.height,
      durationSeconds: result.asset.durationSeconds,
    },
  });
}

function parseAccess(value: FormDataEntryValue | null) {
  if (value === "admin" || value === "entitled") {
    return value;
  }

  return "public";
}

function optionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

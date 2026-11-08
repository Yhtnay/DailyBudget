export async function compressReceiptImageIfPossible(
  file: File
): Promise<{ bytes: Uint8Array; mimeType: string; fileName: string }> {
  if (!file.type.startsWith('image/')) {
    const buf = await file.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
    };
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1200;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        file.arrayBuffer().then((buf) =>
          resolve({
            bytes: new Uint8Array(buf),
            mimeType: file.type,
            fileName: file.name,
          })
        );
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            const buf = await file.arrayBuffer();
            resolve({
              bytes: new Uint8Array(buf),
              mimeType: file.type,
              fileName: file.name,
            });
            return;
          }
          const buf = await blob.arrayBuffer();
          const baseName = file.name.replace(/\.[^.]+$/, '');
          resolve({
            bytes: new Uint8Array(buf),
            mimeType: blob.type || 'image/webp',
            fileName: `${baseName}_compressed.webp`,
          });
        },
        'image/webp',
        0.75
      );
    };
    img.onerror = async () => {
      URL.revokeObjectURL(url);
      const buf = await file.arrayBuffer();
      resolve({
        bytes: new Uint8Array(buf),
        mimeType: file.type,
        fileName: file.name,
      });
    };
    img.src = url;
  });
}

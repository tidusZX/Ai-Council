import { captionFromPhotoAnalysis, limitTelegramText } from "@/lib/anthropic";
import {
  analyzePhotoWithShaqOs,
  type ShaqOsPhotoAnalysis,
} from "@/lib/shaq-os";
import { downloadTelegramFile, getTelegramFile } from "@/lib/telegram";

export type TelegramPhotoSize = {
  file_id: string;
  file_size?: number;
  height?: number;
  width?: number;
};

type GenerateCaptionFromTelegramPhotoInput = {
  caption?: string;
  photos: TelegramPhotoSize[];
};

function getPhotoScore(photo: TelegramPhotoSize): number {
  return photo.file_size ?? (photo.width ?? 0) * (photo.height ?? 0);
}

export function selectLargestTelegramPhoto(
  photos: TelegramPhotoSize[],
): TelegramPhotoSize | null {
  return photos.reduce<TelegramPhotoSize | null>((best, photo) => {
    if (!best || getPhotoScore(photo) > getPhotoScore(best)) {
      return photo;
    }

    return best;
  }, null);
}

function getMimeType(filePath?: string): string {
  if (filePath?.toLowerCase().endsWith(".png")) {
    return "image/png";
  }

  if (filePath?.toLowerCase().endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

function formatShaqOsCaptions(result: ShaqOsPhotoAnalysis): string | null {
  const captions = result.captions?.filter(Boolean) ?? [];

  if (captions.length > 0) {
    return captions
      .slice(0, 3)
      .map((caption, index) => `${index + 1}. ${caption}`)
      .join("\n\n");
  }

  if (result.caption) {
    return result.caption;
  }

  return null;
}

export async function generateCaptionFromTelegramPhoto({
  caption,
  photos,
}: GenerateCaptionFromTelegramPhotoInput): Promise<string> {
  const photo = selectLargestTelegramPhoto(photos);

  if (!photo) {
    throw new Error("Telegram photo payload is empty");
  }

  const telegramFile = await getTelegramFile(photo.file_id);
  const image = await downloadTelegramFile(telegramFile);
  const analysis = await analyzePhotoWithShaqOs({
    caption,
    fileName: telegramFile.file_path ?? `${photo.file_id}.jpg`,
    image,
    mimeType: getMimeType(telegramFile.file_path),
  });
  const shaqOsCaptions = formatShaqOsCaptions(analysis);

  if (shaqOsCaptions) {
    return limitTelegramText(shaqOsCaptions);
  }

  return captionFromPhotoAnalysis({
    analysis: analysis.analysis,
    userCaption: caption,
  });
}

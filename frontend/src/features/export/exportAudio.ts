import JSZip from "jszip";
import { fetchAudioViaProxy } from "@/lib/apiClient";
import type { ModelItem, ParagraphItem } from "@/features/studio/types";
import { hasParagraphAudio } from "@/features/studio/paragraphModel";

const PREMIERE_XML_FPS = 30;
const PREMIERE_XML_PAUSE_SECONDS = 1;
const PREMIERE_AUDIO_SAMPLE_RATE = 48_000;

type PremiereExportClip = {
  name: string;
  fileName: string;
  pathUrl: string;
  text: string;
  speakerName: string;
  durationSeconds: number;
  durationFrames: number;
  startFrame: number;
  endFrame: number;
};

const encodeWav = (buffer: AudioBuffer): Blob => {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = buffer.getChannelData(channel)[frame] ?? 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 32768 : clamped * 32767, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([wavBuffer], { type: "audio/wav" });
};

const downloadBlob = (blob: Blob, fileName: string): void => {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
};

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const secondsToTimelineFrames = (seconds: number): number =>
  Math.max(1, Math.ceil(Math.max(0, seconds) * PREMIERE_XML_FPS));

const buildPremiereXml = (clips: PremiereExportClip[], sequenceName: string): string => {
  const totalFrames = clips.length > 0 ? clips[clips.length - 1].endFrame : 0;
  const safeSequenceName = xmlEscape(sequenceName);
  const videoFormat = `          <format>
            <samplecharacteristics>
              <width>1920</width>
              <height>1080</height>
              <anamorphic>FALSE</anamorphic>
              <pixelaspectratio>square</pixelaspectratio>
              <fielddominance>none</fielddominance>
              <rate>
                <timebase>${PREMIERE_XML_FPS}</timebase>
                <ntsc>FALSE</ntsc>
              </rate>
              <colordepth>24</colordepth>
            </samplecharacteristics>
          </format>`;
  const audioOutputs = `          <outputs>
            <group>
              <index>1</index>
              <numchannels>2</numchannels>
              <downmix>0</downmix>
              <channel>
                <index>1</index>
              </channel>
              <channel>
                <index>2</index>
              </channel>
            </group>
          </outputs>`;
  const buildTrackClipItems = (trackIndex: 1 | 2): string =>
    clips
      .map((clip, index) => {
        const clipId = `clipitem-${index + 1}-${trackIndex}`;
        const fileId = `file-${index + 1}`;
        const safeName = xmlEscape(clip.name);
        const safeFileName = xmlEscape(clip.fileName);
        const pathUrl = xmlEscape(clip.pathUrl);

        return `            <clipitem id="${clipId}">
              <name>${safeName}</name>
              <duration>${clip.durationFrames}</duration>
              <rate>
                <timebase>${PREMIERE_XML_FPS}</timebase>
                <ntsc>FALSE</ntsc>
              </rate>
              <enabled>TRUE</enabled>
              <start>${clip.startFrame}</start>
              <end>${clip.endFrame}</end>
              <in>0</in>
              <out>${clip.durationFrames}</out>
              <file id="${fileId}">
                <name>${safeFileName}</name>
                <pathurl>${pathUrl}</pathurl>
                <rate>
                  <timebase>${PREMIERE_XML_FPS}</timebase>
                  <ntsc>FALSE</ntsc>
                </rate>
                <duration>${clip.durationFrames}</duration>
                <timecode>
                  <rate>
                    <timebase>${PREMIERE_XML_FPS}</timebase>
                    <ntsc>FALSE</ntsc>
                  </rate>
                  <string>00:00:00:00</string>
                  <frame>0</frame>
                  <displayformat>NDF</displayformat>
                </timecode>
                <media>
                  <audio>
                    <samplecharacteristics>
                      <depth>16</depth>
                      <samplerate>${PREMIERE_AUDIO_SAMPLE_RATE}</samplerate>
                    </samplecharacteristics>
                    <channelcount>2</channelcount>
                  </audio>
                </media>
              </file>
              <sourcetrack>
                <mediatype>audio</mediatype>
                <trackindex>${trackIndex}</trackindex>
              </sourcetrack>
            </clipitem>`;
      })
      .join("\n");
  const audioTracks = ([1, 2] as const)
    .map((clip, index) => {
      const outputIndex = index + 1;
      return `          <track>
${buildTrackClipItems(clip)}
            <enabled>TRUE</enabled>
            <locked>FALSE</locked>
            <outputchannelindex>${outputIndex}</outputchannelindex>
          </track>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <project>
    <name>${safeSequenceName}</name>
    <children>
      <sequence id="sequence-1">
        <name>${safeSequenceName}</name>
        <duration>${totalFrames}</duration>
        <rate>
          <timebase>${PREMIERE_XML_FPS}</timebase>
          <ntsc>FALSE</ntsc>
        </rate>
        <timecode>
          <rate>
            <timebase>${PREMIERE_XML_FPS}</timebase>
            <ntsc>FALSE</ntsc>
          </rate>
          <string>00:00:00:00</string>
          <frame>0</frame>
          <displayformat>NDF</displayformat>
        </timecode>
        <media>
          <video>
${videoFormat}
            <track>
              <enabled>TRUE</enabled>
              <locked>FALSE</locked>
            </track>
          </video>
          <audio>
            <format>
              <samplecharacteristics>
                <depth>16</depth>
                <samplerate>${PREMIERE_AUDIO_SAMPLE_RATE}</samplerate>
              </samplecharacteristics>
            </format>
${audioOutputs}
${audioTracks}
          </audio>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>
`;
};

const resampleBuffer = async (
  buffer: AudioBuffer,
  targetRate: number,
): Promise<AudioBuffer> => {
  if (buffer.sampleRate === targetRate) {
    return buffer;
  }

  const offlineContext = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.ceil(buffer.duration * targetRate),
    targetRate,
  );

  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineContext.destination);
  source.start(0);

  return offlineContext.startRendering();
};

const ensureChannelCount = (
  buffer: AudioBuffer,
  targetChannels: number,
  audioContext: BaseAudioContext,
): AudioBuffer => {
  if (buffer.numberOfChannels === targetChannels) {
    return buffer;
  }

  const normalized = audioContext.createBuffer(targetChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < targetChannels; channel += 1) {
    const sourceChannel = Math.min(channel, buffer.numberOfChannels - 1);
    normalized.copyToChannel(buffer.getChannelData(sourceChannel), channel);
  }
  return normalized;
};

export const exportWav = async (paragraphs: ParagraphItem[]): Promise<void> => {
  const prepared: Blob[] = [];
  for (const item of paragraphs) {
    if (item.status !== "ok") {
      continue;
    }

    if (item.audioBlob) {
      prepared.push(item.audioBlob);
      continue;
    }

    if (item.audioUrl) {
      prepared.push(await fetchAudioViaProxy(item.audioUrl));
    }
  }

  const audioContext = new AudioContext();
  try {
    const decoded = await Promise.all(
      prepared.map(async (blob) => audioContext.decodeAudioData(await blob.arrayBuffer())),
    );

    if (decoded.length === 0) {
      throw new Error("No audio clips available to export.");
    }

    const targetRate = decoded[0].sampleRate;
    const normalized = await Promise.all(decoded.map((buffer) => resampleBuffer(buffer, targetRate)));
    const channels = Math.max(...normalized.map((buffer) => buffer.numberOfChannels));
    const totalFrames = normalized.reduce((sum, buffer) => sum + buffer.length, 0);
    const merged = audioContext.createBuffer(channels, totalFrames, targetRate);

    let writeOffset = 0;
    for (const buffer of normalized) {
      for (let channel = 0; channel < channels; channel += 1) {
        const targetChannel = merged.getChannelData(channel);
        const sourceChannel =
          channel < buffer.numberOfChannels
            ? buffer.getChannelData(channel)
            : buffer.getChannelData(buffer.numberOfChannels - 1);
        targetChannel.set(sourceChannel, writeOffset);
      }
      writeOffset += buffer.length;
    }

    downloadBlob(encodeWav(merged), "voicestudio-export.wav");
  } finally {
    await audioContext.close();
  }
};

export const exportPremierePackage = async ({
  activeProjectName,
  models,
  paragraphs,
}: {
  activeProjectName: string;
  models: ModelItem[];
  paragraphs: ParagraphItem[];
}): Promise<void> => {
  const audioContext = new AudioContext();

  try {
    const zip = new JSZip();
    const audioFolder = zip.folder("audio");
    if (!audioFolder) {
      throw new Error("Unable to create audio folder for export.");
    }

    const pauseFrames = Math.round(PREMIERE_XML_PAUSE_SECONDS * PREMIERE_XML_FPS);
    let timelineCursor = 0;
    const clips: PremiereExportClip[] = [];

    const okParagraphs = paragraphs.filter(
      (item) => item.status === "ok" && hasParagraphAudio(item),
    );

    for (const [index, item] of okParagraphs.entries()) {
      const sourceBlob = item.audioBlob ?? (item.audioUrl ? await fetchAudioViaProxy(item.audioUrl) : null);
      if (!sourceBlob) {
        continue;
      }

      const decoded = await audioContext.decodeAudioData(await sourceBlob.arrayBuffer());
      const resampled = await resampleBuffer(decoded, PREMIERE_AUDIO_SAMPLE_RATE);
      const normalized = ensureChannelCount(resampled, 2, audioContext);
      const wavBlob = encodeWav(normalized);
      const clipNumber = (index + 1).toString().padStart(3, "0");
      const fileName = `clip_${clipNumber}.wav`;
      audioFolder.file(fileName, wavBlob);

      const durationFrames = secondsToTimelineFrames(normalized.duration);
      const speaker = models.find((model) => model.id === item.speakerModelId);
      const clip: PremiereExportClip = {
        name: `Clip ${clipNumber}`,
        fileName,
        pathUrl: `audio/${fileName}`,
        text: item.text,
        speakerName: speaker?.name ?? "Unknown",
        durationSeconds: normalized.duration,
        durationFrames,
        startFrame: timelineCursor,
        endFrame: timelineCursor + durationFrames,
      };

      clips.push(clip);
      timelineCursor = clip.endFrame + pauseFrames;
    }

    if (clips.length === 0) {
      throw new Error("No audio clips available to export.");
    }

    const sequenceName = activeProjectName.trim() || "VoiceStudio Export";
    const manifest = {
      app: "VoiceStudio",
      format: "premiere-xmeml-package",
      generatedAt: new Date().toISOString(),
      sequenceName,
      xmlFile: "timeline.xml",
      audioFolder: "audio",
      timeline: {
        fps: PREMIERE_XML_FPS,
        pauseSeconds: PREMIERE_XML_PAUSE_SECONDS,
        audioSampleRate: PREMIERE_AUDIO_SAMPLE_RATE,
      },
      clips: clips.map((clip, index) => ({
        index: index + 1,
        fileName: `audio/${clip.fileName}`,
        speakerName: clip.speakerName,
        text: clip.text,
        durationSeconds: clip.durationSeconds,
        startSeconds: clip.startFrame / PREMIERE_XML_FPS,
        endSeconds: clip.endFrame / PREMIERE_XML_FPS,
      })),
    };

    zip.file("timeline.xml", buildPremiereXml(clips, sequenceName));
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file(
      "fix-premiere-paths.ps1",
      [
        "$ErrorActionPreference = 'Stop'",
        "$packageDir = Split-Path -Parent $MyInvocation.MyCommand.Path",
        "$inputXml = Join-Path $packageDir 'timeline.xml'",
        "$outputXml = Join-Path $packageDir 'timeline-premiere-fixed.xml'",
        "$content = Get-Content -LiteralPath $inputXml -Raw",
        "$content = [regex]::Replace($content, '<pathurl>audio/(clip_\\d+\\.wav)</pathurl>', {",
        "  param($match)",
        "  $wavPath = Join-Path (Join-Path $packageDir 'audio') $match.Groups[1].Value",
        "  $uri = [Uri]::new($wavPath).AbsoluteUri",
        "  \"<pathurl>$uri</pathurl>\"",
        "})",
        "Set-Content -LiteralPath $outputXml -Value $content -Encoding UTF8",
        "Write-Host \"Created $outputXml\"",
      ].join("\n"),
    );
    zip.file(
      "README.txt",
      [
        "VoiceStudio Premiere package",
        "",
        "1. Extract this ZIP before importing.",
        "2. On Windows, right-click fix-premiere-paths.ps1 and run it with PowerShell.",
        "3. In Adobe Premiere Pro, import timeline-premiere-fixed.xml.",
        "4. If Premiere asks to locate media, choose the matching files inside the audio folder.",
        "",
        "timeline.xml uses portable relative paths. The PowerShell helper rewrites them",
        "to absolute file URLs, which Premiere imports more reliably on Windows.",
        "",
        `Timeline pause between clips: ${PREMIERE_XML_PAUSE_SECONDS}s.`,
      ].join("\n"),
    );

    downloadBlob(await zip.generateAsync({ type: "blob" }), "voicestudio-premiere-package.zip");
  } finally {
    await audioContext.close();
  }
};

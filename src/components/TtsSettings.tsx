import { useState, useEffect } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useToast } from "@/context/ToastContext";
import {
  ttsStatus,
  installTts,
  uninstallTts,
  getTtsStorageSize,
  resetEngineAvailability,
  formatBytes,
  type DownloadProgress,
} from "@/lib/tts";

export function TtsSettings() {
  const toast = useToast();

  const [installed, setInstalled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [storageSize, setStorageSize] = useState<number>(0);

  useEffect(() => {
    loadState();
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<DownloadProgress>("tts-download-progress", (event) => {
      setDownloadProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const loadState = async () => {
    try {
      setLoading(true);
      const [status, size] = await Promise.all([
        ttsStatus(),
        getTtsStorageSize(),
      ]);
      setInstalled(status.installed);
      setStorageSize(size);
    } catch (error) {
      console.error("Failed to load TTS state:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async () => {
    try {
      setInstalling(true);
      setDownloadProgress({ id: "tts", progress: 0, message: "Starting..." });
      await installTts();
      resetEngineAvailability();
      toast.success("TTS engine installed");
      await loadState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to install TTS engine");
    } finally {
      setInstalling(false);
      setDownloadProgress(null);
    }
  };

  const handleUninstall = async () => {
    try {
      await uninstallTts();
      resetEngineAvailability();
      toast.success("TTS engine removed");
      await loadState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove TTS engine");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#939293] py-4">
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span>Loading TTS settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* MeloTTS Engine */}
      <div className={`p-4 bg-[#2d2a2e] rounded-lg border ${installing ? 'border-[#ffd866]/30' : 'border-[#5b595c]'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${installed ? 'bg-[#a9dc76]/20' : 'bg-[#5b595c]/50'}`}>
              <svg className={`w-5 h-5 ${installed ? 'text-[#a9dc76]' : 'text-[#939293]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-[#fcfcfa]">MeloTTS Engine</p>
              <p className="text-xs text-[#939293]">
                {installed ? "Installed and ready" : "High-quality offline, multilingual synthesis"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {installed ? (
              <button
                onClick={handleUninstall}
                className="px-3 py-1.5 text-[#ff6188] text-sm hover:bg-[#ff6188]/10 rounded-lg transition-colors"
              >
                Remove
              </button>
            ) : (
              <button
                onClick={handleInstall}
                disabled={installing}
                className="px-3 py-1.5 bg-[#a9dc76] text-[#2d2a2e] rounded-lg text-sm font-medium hover:bg-[#a9dc76]/90 transition-colors disabled:opacity-50"
              >
                {installing ? "Installing..." : "Install"}
              </button>
            )}
          </div>
        </div>

        {installing && downloadProgress?.id === "tts" && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-[#939293] mb-1">
              <span>{downloadProgress.message}</span>
              <span>{Math.round(downloadProgress.progress * 100)}%</span>
            </div>
            <div className="h-1.5 bg-[#5b595c] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#ffd866] rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress.progress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#5b595c]">
          Falls back to your system voice until the engine is installed.
        </p>
        {storageSize > 0 && (
          <span className="text-xs text-[#939293]">{formatBytes(storageSize)} used</span>
        )}
      </div>
    </div>
  );
}

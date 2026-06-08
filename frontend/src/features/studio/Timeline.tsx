import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../shared/components/Button";
import { useStudioStore } from "../../shared/state/studioStore";

export function Timeline() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const activeAudioUrl = useStudioStore((state) => state.activeAudioUrl);
  const paragraphs = useStudioStore((state) => state.paragraphs);
  const playable = paragraphs.filter((paragraph) => paragraph.audio_url);

  useEffect(() => {
    if (!activeAudioUrl || !audioRef.current) return;
    audioRef.current.src = activeAudioUrl;
    void audioRef.current.play();
    setPlaying(true);
  }, [activeAudioUrl]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    void audioRef.current.play();
    setPlaying(true);
  };

  return (
    <footer className="timeline">
      <audio ref={audioRef} onEnded={() => setPlaying(false)} />
      <div>
        <strong>Timeline</strong>
        <span>{playable.length} clips generados</span>
      </div>
      <Button className="round-button" onClick={toggle} disabled={!activeAudioUrl} aria-label="Toggle playback">
        {playing ? <Pause size={20} /> : <Play size={20} />}
      </Button>
      <div className="clip-rail">
        {paragraphs.map((paragraph) => (
          <span key={paragraph.id} className={`clip-pill status-${paragraph.status}`} />
        ))}
      </div>
    </footer>
  );
}


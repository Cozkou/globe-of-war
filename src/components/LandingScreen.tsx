import { useState } from 'react';
import { Button } from './ui/button';

interface LandingScreenProps {
  onStart: () => void;
}

export default function LandingScreen({ onStart }: LandingScreenProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleStart = () => {
    setIsAnimating(true);
    setTimeout(() => {
      onStart();
    }, 1000);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-background via-background to-war-dark">
      {/* CRT scanlines effect */}
      <div className="absolute inset-0 pointer-events-none opacity-10 crt-effect"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 0, 0, 0.3) 2px, rgba(255, 0, 0, 0.3) 4px)'
        }}
      />
      
      <div className={`flex flex-col items-center gap-12 ${isAnimating ? 'fly-up' : ''}`}>
        <div className="space-y-8 text-center">
          <h1 className="text-5xl md:text-7xl lg:text-9xl text-primary text-glow leading-none px-4 font-bold drop-shadow-[0_0_15px_rgba(255,0,0,0.8)]">
            WAR<br/>PROTOCOL
          </h1>
          
          <p className="text-sm md:text-base lg:text-lg text-foreground tracking-[0.3em] px-4 opacity-90">
            SELECT YOUR NATION. PREPARE FOR WAR.
          </p>
        </div>
        
        <Button
          onClick={handleStart}
          variant="default"
          size="lg"
          className="mt-12 px-12 py-8 text-base md:text-lg tracking-widest bg-primary hover:bg-war-glow border-2 border-war-glow text-primary-foreground transition-all hover:scale-110 hover:shadow-[0_0_30px_rgba(255,0,0,0.7)] font-bold"
        >
          SELECT COUNTRY
        </Button>
      </div>

      {/* Red glow at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-war-blood/30 to-transparent pointer-events-none" />
    </div>
  );
}

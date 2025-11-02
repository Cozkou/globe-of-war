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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-background via-background to-background">
      {/* Animated grid background */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(255, 51, 51, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 51, 51, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'gridMove 20s linear infinite'
        }} />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-primary/30 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${10 + Math.random() * 20}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`
            }}
          />
        ))}
      </div>

      {/* Radar sweep effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-10">
        <div className="absolute top-1/2 left-1/2 w-[800px] h-[800px] -translate-x-1/2 -translate-y-1/2">
          <div className="absolute inset-0 rounded-full border border-primary" />
          <div className="absolute inset-0 rounded-full border border-primary" style={{ transform: 'scale(0.7)' }} />
          <div className="absolute inset-0 rounded-full border border-primary" style={{ transform: 'scale(0.4)' }} />
          <div 
            className="absolute inset-0"
            style={{
              background: 'conic-gradient(from 0deg, transparent 60%, rgba(255, 51, 51, 0.3) 100%)',
              borderRadius: '50%',
              animation: 'radarSweep 4s linear infinite'
            }}
          />
        </div>
      </div>
      
      {/* CRT scanlines effect */}
      <div className="absolute inset-0 pointer-events-none opacity-5 crt-effect"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 0, 0, 0.15) 2px, rgba(255, 0, 0, 0.15) 4px)'
        }}
      />
      
      <div className={`flex flex-col items-center gap-8 ${isAnimating ? 'fly-up' : ''}`}>
        <div className="space-y-6 text-center">
          <h1 className="text-4xl md:text-6xl lg:text-7xl text-primary leading-tight px-4 tracking-[0.3em]">
            SKYTRACK
          </h1>
          
          <p className="text-xs md:text-sm text-muted-foreground tracking-widest px-4">
            REAL-TIME GLOBAL AIRCRAFT TRACKING
          </p>
          
          <p className="text-xs text-muted-foreground/80 max-w-md mx-auto px-6 leading-relaxed mt-4">
            Experience live air traffic data from around the world. Select any country to view real-time aircraft positions and explore global flight patterns.
          </p>
        </div>
        
        {/* Info container about chaos theory */}
        <div className="bg-card/80 border-2 border-primary/50 px-8 py-6 max-w-xl mx-4 space-y-3">
          <h3 className="text-xs text-primary tracking-wider">CHAOS THEORY SIMULATION</h3>
          <p className="text-[10px] md:text-xs text-muted-foreground/90 leading-relaxed">
            This project explores the butterfly effect: how small changes in initial conditions can lead to vastly different outcomes. 
            By adjusting the radar sensitivity slider, witness how a minor variable shift cascades into global conflict.
          </p>
          <p className="text-[10px] md:text-xs text-muted-foreground/90 leading-relaxed">
            We're investigating the fragility of international stability through real-time aviation data and dynamic conflict modeling.
          </p>
        </div>
        
        <Button
          onClick={handleStart}
          variant="default"
          size="lg"
          className="mt-4 px-8 py-6 text-sm tracking-wider bg-primary hover:bg-war-glow border-2 border-war-glow text-primary-foreground transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(255,0,0,0.5)] animate-pulse"
          style={{
            animation: 'buttonPulse 2s ease-in-out infinite'
          }}
        >
          SELECT COUNTRY
        </Button>
      
      <style>
        {`
          @keyframes buttonPulse {
            0%, 100% {
              transform: scale(1);
              box-shadow: 0 0 20px rgba(255, 0, 0, 0.5);
            }
            50% {
              transform: scale(1.05);
              box-shadow: 0 0 40px rgba(255, 0, 0, 0.8), 0 0 60px rgba(255, 0, 0, 0.4);
            }
          }
          
          @keyframes gridMove {
            0% {
              transform: translate(0, 0);
            }
            100% {
              transform: translate(50px, 50px);
            }
          }
          
          @keyframes float {
            0%, 100% {
              transform: translate(0, 0);
              opacity: 0.3;
            }
            25% {
              transform: translate(10px, -10px);
              opacity: 0.5;
            }
            50% {
              transform: translate(-5px, -20px);
              opacity: 0.8;
            }
            75% {
              transform: translate(-10px, -10px);
              opacity: 0.5;
            }
          }
          
          @keyframes radarSweep {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground tracking-wider">
        WLDN x Builder's Brew | HackTheBurgh 2025 ©
      </div>

      {/* Red glow at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-war-blood/10 to-transparent pointer-events-none" />
    </div>
  );
}

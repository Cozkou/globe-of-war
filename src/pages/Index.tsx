import { useState } from 'react';
import LandingScreen from '@/components/LandingScreen';
import Globe from '@/components/Globe';
import MapView2D from '@/components/MapView2D';
import { toast } from 'sonner';
import { HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const Index = () => {
  const [showGlobe, setShowGlobe] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [showMapView, setShowMapView] = useState(false);

  const handleStart = () => {
    setShowGlobe(true);
  };

  const handleCountrySelect = (country: string) => {
    setSelectedCountry(country);
    // Transition to 2D map view with animation delay
    setTimeout(() => {
      setShowMapView(true);
      toast.success(`${country} selected`, {
        description: "Your nation stands ready for war.",
        duration: 3000,
      });
    }, 800);
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Help Button */}
      {showGlobe && (
        <Dialog>
          <DialogTrigger asChild>
            <button className="fixed bottom-4 right-4 z-50 bg-card/95 border-2 border-primary hover:bg-primary/20 hover:border-war-glow transition-all w-10 h-10 rounded flex items-center justify-center animate-scale-in">
              <HelpCircle className="w-5 h-5 text-primary" />
            </button>
          </DialogTrigger>
          <DialogContent className="bg-card/95 border-2 border-primary max-w-md backdrop-blur-sm">
            <DialogHeader>
              <DialogTitle className="text-primary text-sm tracking-wider">ABOUT SKYTRACK</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs leading-relaxed pt-2">
                SkyTrack is a real-time global aircraft tracking application. Select a country to view live aircraft positions and flight data within that region. The radar interface displays aircraft movements with detailed information including altitude, speed, and flight paths.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}

      {!showGlobe ? (
        <LandingScreen onStart={handleStart} />
      ) : showMapView && selectedCountry ? (
        <div className="animate-fade-in" key="mapview">
          <MapView2D selectedCountry={selectedCountry} />
        </div>
      ) : (
        <div className={selectedCountry ? "animate-fade-out" : "animate-fade-in"} key="globe">
          {/* Only render Globe when not transitioning to map view */}
          {!showMapView && (
            <Globe onCountrySelect={handleCountrySelect} />
          )}
          
          {selectedCountry && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-card/95 border-2 border-primary px-8 py-4 animate-scale-in">
              <p className="text-xs text-center">
                <span className="text-muted-foreground">CURRENT NATION:</span>
                <br />
                <span className="text-primary text-glow text-sm mt-1 inline-block">{selectedCountry}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
};

export default Index;

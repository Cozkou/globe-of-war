import { useState } from 'react';
import LandingScreen from '@/components/LandingScreen';
import Globe from '@/components/Globe';
import MapView2D from '@/components/MapView2D';
import { toast } from 'sonner';

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
      {!showGlobe ? (
        <LandingScreen onStart={handleStart} />
      ) : showMapView && selectedCountry ? (
        <div className="animate-fade-in">
          <MapView2D selectedCountry={selectedCountry} />
        </div>
      ) : (
        <div className={selectedCountry ? "animate-fade-out" : "animate-fade-in"}>
          <Globe onCountrySelect={handleCountrySelect} />
          
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

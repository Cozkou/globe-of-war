import { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { HelpCircle } from 'lucide-react';

interface MapView2DProps {
  selectedCountry: string;
}

export default function MapView2D({ selectedCountry }: MapView2DProps) {
  return (
    <div className="relative w-full h-screen bg-background overflow-hidden">
      {/* Map container with animation */}
      <div className="absolute inset-0 animate-fade-in">
        {/* Placeholder for 2D map - using SVG or canvas for country visualization */}
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#0a2040] to-[#051a35]">
          <div className="text-center space-y-4">
            <p className="text-xs text-primary tracking-wider">2D MAP VIEW</p>
            <p className="text-sm text-muted-foreground">Selected: {selectedCountry}</p>
          </div>
        </div>
      </div>

      {/* Country indicator in top-right corner */}
      <div className="absolute top-4 right-4 bg-card/90 border-2 border-primary px-4 py-2 flex items-center gap-2 z-20">
        <p className="text-xs text-primary tracking-wider">
          COUNTRY SELECTED: {selectedCountry.toUpperCase()}
        </p>
      </div>

      {/* Help button with modal */}
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 left-4 bg-card/90 border-2 border-primary hover:bg-card/80 z-20"
          >
            <HelpCircle className="h-5 w-5 text-primary" />
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card/95 border-2 border-primary max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary tracking-wider">WAR PROTOCOL</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Welcome to the War Protocol simulation. You have selected your nation and are now viewing the global theater of operations.
            </p>
            <p>
              This strategic interface allows you to monitor your country's position and prepare for engagement.
            </p>
            <p className="text-xs text-primary tracking-wider">
              PREPARE FOR WAR.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

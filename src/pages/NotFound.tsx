import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <h1 className="text-6xl font-bold text-primary text-glow">404</h1>
        <p className="text-sm text-muted-foreground tracking-wider uppercase">
          TERRITORY NOT FOUND
        </p>
        <Button
          onClick={() => window.location.href = "/"}
          variant="default"
          className="mt-8"
        >
          RETURN TO BASE
        </Button>
      </div>
    </div>
  );
};

export default NotFound;

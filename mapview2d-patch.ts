// This is a reference file showing the changes needed to MapView2D.tsx
// The actual file needs to be edited manually or via sed/awk

// ADD THIS IMPORT after line 6:
// import { calculateBoundingBox, buildAircraftApiUrl } from '@/lib/country-bounds';

// REPLACE Aircraft interface (lines 25-29):
interface Aircraft {
  icao24: string;
  callsign: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  velocity: number | null;
  heading: number | null;
}

// REPLACE the useEffect block (lines 38-60) with:

  // Load country data
  useEffect(() => {
    fetch('/countries.json')
      .then(response => response.json())
      .then((topology: any) => {
        const countriesObject = topology.objects.countries;
        const geojson: any = feature(topology, countriesObject);
        setCountries(geojson.features as GeoJSONFeature[]);
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Error loading country data:', error);
        setIsLoading(false);
      });
  }, []);

  // Fetch aircraft data when a country is selected
  useEffect(() => {
    if (!selectedCountry || countries.length === 0) {
      setAircraft([]);
      return;
    }

    // Find the selected country's geometry
    const country = countries.find(c => c.properties.name === selectedCountry);
    if (!country) {
      console.warn(`Country not found: ${selectedCountry}`);
      setAircraft([]);
      return;
    }

    // Calculate bounding box for the country
    try {
      const bbox = calculateBoundingBox(country.geometry as any);
      const apiUrl = buildAircraftApiUrl(bbox);
      
      console.log(`Fetching aircraft for ${selectedCountry}:`, bbox);
      
      fetch(apiUrl)
        .then(response => response.json())
        .then((data: { success: boolean; data: Aircraft[]; count: number }) => {
          if (data.success && data.data) {
            console.log(`Loaded ${data.count} aircraft for ${selectedCountry}`);
            setAircraft(data.data);
          } else {
            console.error('Failed to load aircraft:', data);
            setAircraft([]);
          }
        })
        .catch(error => {
          console.error('Error loading aircraft data:', error);
          setAircraft([]);
        });
    } catch (error) {
      console.error('Error calculating bounding box:', error);
      setAircraft([]);
    }
  }, [selectedCountry, countries]);


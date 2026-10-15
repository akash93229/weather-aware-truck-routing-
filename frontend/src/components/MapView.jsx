import { useRef } from 'react';
import Map, { NavigationControl } from 'react-map-gl/maplibre';
import * as maplibregl from 'maplibre-gl';

const CARTO_DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export default function MapView() {
  const mapRef = useRef(null);

  return (
    <div className="map-wrapper" id="map-container">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={{
          longitude: -95.7129,
          latitude: 37.0902,
          zoom: 3.8,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={CARTO_DARK_STYLE}
        attributionControl={false}
      >
        <NavigationControl position="top-right" />
      </Map>
    </div>
  );
}

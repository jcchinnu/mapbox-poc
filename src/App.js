import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import 'mapbox-gl/dist/mapbox-gl.css';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import centroid from "@turf/centroid";
import { bbox, randomPoint, booleanPointInPolygon, distance } from "@turf/turf";

mapboxgl.accessToken = "pk.eyJ1IjoiamF5YWNoYW5kcmEtamMiLCJhIjoiY2xmYXgwZzY0MXBqYzNzcGNycWx4eHp2biJ9.GYh5aIXFY73n0oJZD-3LYQ";

const MapboxPolygon = () => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const [polygonName, setPolygonName] = useState("");
  const [popup, setPopup] = useState(null);

  const [savedPolygons, setSavedPolygons] = useState([]);
  const [selectedPolygon, setSelectedPolygon] = useState(null);
  const [canDrawInner, setCanDrawInner] = useState(false);
  const [innerPolygons, setInnerPolygons] = useState([]);
  const canDrawInnerRef = useRef(false);
  const selectedPolygonRef = useRef("");
  const [metrics, setMetrics] = useState({
    Mechanical: 400,
    Electrical: 500,
    Technicians: 600,
  });

  useEffect(() => {
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-v9",
      center: [78.4867, 17.3850],
      zoom: 17,
    });

    drawRef.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    });

    mapRef.current.addControl(drawRef.current);

    mapRef.current.on("load", () => {
      console.log("Map has fully loaded.");
      loadSavedPolygons();
    });

    mapRef.current.on("draw.create", (event) => {
      const polygon = event.features[0];
      if (!polygon) return;
      console.log("Polygon Drawn:", polygon);

      const center = centroid(polygon).geometry.coordinates;
      const popupElement = document.createElement("div");
      popupElement.innerHTML = `
        <input type="text" id="polygon-name" placeholder="Enter name" style="width:120px; padding:5px;"/>
        <button id="save-polygon" style="margin-left:5px;">Save</button>
      `;

      const popup = new mapboxgl.Popup({ closeOnClick: false })
        .setLngLat(center)
        .setDOMContent(popupElement)
        .addTo(mapRef.current);

      setTimeout(() => {
        const saveButton = document.getElementById("save-polygon");
        if (saveButton) {
          saveButton.onclick = () => {
            const name = document.getElementById("polygon-name").value.trim();
            if (name) {
              console.log("can draw inner and selected polygon", canDrawInnerRef.current);
              if (canDrawInnerRef.current && selectedPolygonRef.current) {
                console.log("polygon is", polygon);
                if (!booleanPointInPolygon(centroid(polygon).geometry, selectedPolygonRef.current)) {
                  alert("Inner polygon must be inside the outer polygon");
                  return;
                }
                saveInnerPolygon(name, polygon);
              } else {
                savePolygon(name, polygon);
              }
              alert(`Polygon "${name}" saved!`);
              popup.remove();
            }
          };
        }
      }, 500);
    });

    return () => mapRef.current.remove();
  }, []);

  const savePolygon = (name, polygon) => {
    let storedPolygons = JSON.parse(localStorage.getItem("polygons")) || {};
    storedPolygons[name] = polygon;
    localStorage.setItem("polygons", JSON.stringify(storedPolygons));
    setSavedPolygons(Object.entries(storedPolygons));
    setSelectedPolygon(polygon);
    selectedPolygonRef.current = polygon;
    setCanDrawInner(true);
    loadSavedPolygons();
  };

  const saveInnerPolygon = (name, polygon) => {
    let storedInnerPolygons = JSON.parse(localStorage.getItem("innerPolygons")) || {};
    storedInnerPolygons[name] = polygon;
    localStorage.setItem("innerPolygons", JSON.stringify(storedInnerPolygons));
    setInnerPolygons(Object.entries(storedInnerPolygons));
    loadSavedPolygons();
  };

  const loadSavedPolygons = () => {
    if (!mapRef.current.isStyleLoaded()) {
      console.log("Map style is not loaded yet, waiting...");
      mapRef.current.once("style.load", loadSavedPolygons);
      return;
    }
    mapRef.current.getStyle().layers.forEach((layer) => {
      if (layer.id.startsWith("polygon-")) {
        mapRef.current.removeLayer(layer.id);
        mapRef.current.removeSource(layer.id);
      }
    });
    
    let storedPolygons = JSON.parse(localStorage.getItem("polygons")) || {};
    setSavedPolygons(Object.entries(storedPolygons));
    Object.entries(storedPolygons).forEach(([name, polygon]) => {
      mapRef.current.addSource(`polygon-${name}`, { type: "geojson", data: polygon });
      mapRef.current.addLayer({
        id: `polygon-${name}`,
        type: "fill",
        source: `polygon-${name}`,
        paint: { "fill-color": "#ffff00", "fill-opacity": 0.1 },
      });
    });

    let storedInnerPolygons = JSON.parse(localStorage.getItem("innerPolygons")) || {};
    setInnerPolygons(Object.entries(storedInnerPolygons));
    Object.entries(storedInnerPolygons).forEach(([name, polygon]) => {
      mapRef.current.addSource(`innerPolygon-${name}`, { type: "geojson", data: polygon });
      mapRef.current.addLayer({
        id: `innerPolygon-${name}`,
        type: "fill",
        source: `innerPolygon-${name}`,
        paint: { "fill-color": "#ffff00", "fill-opacity": 0.4 },
      });
    });
  };

  const canDrawFunctionality = () => {
    console.log("heyyyyy");
    canDrawInnerRef.current = true;
  }

  const plotMetrics = () => {
    let placedCircles = [];
    Object.entries(metrics).forEach(([name, value], index) => {
      const innerPolygon = innerPolygons[0][1]?.geometry;
      if (!innerPolygon) return;

      const center = centroid(innerPolygon).geometry.coordinates;
      let baseRadius = value / 100;
      console.log("base radius is", baseRadius);
      const color = ["#ff5733", "#33ff57", "#3357ff"][index % 3];

      let validPosition = false;
      let adjustedCenter = [...center];
      let attempts = 0;
      while (!validPosition && attempts < 100) {
        if (booleanPointInPolygon(adjustedCenter, innerPolygon)) {
          validPosition = true;
        } else {
          console.log("is this coming here");
          adjustedCenter[0] += 0.0001; // Small shift
          adjustedCenter[1] += 0.0001;
        }
        attempts++;
      }

      placedCircles.push({ center: adjustedCenter, radius: baseRadius });
      console.log("placed circles are", placedCircles);
      mapRef.current.addLayer({
        id: `metric-${name}`,
        type: "circle",
        source: {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "Point", coordinates: adjustedCenter },
          },
        },
        paint: {
          "circle-radius": ["interpolate",  ['exponential', 2], ["zoom"], 10, 5, 15, 12, 17, 20, 19, 30],
          "circle-color": color,
          "circle-opacity": 0.7,
        },
      });

      mapRef.current.addLayer({
        id: `metric-text-${name}`,
        type: "symbol",
        source: {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "Point", coordinates: adjustedCenter },
            properties: { label: value.toString() },
          },
        },
        layout: {
          "text-field": ["step", ["zoom"], "", 19, ["get", "label"]],
          "text-size": 14,
          "text-anchor": "center",
        },
      });
    });
  };

  return (
    <div>
      <button onClick={canDrawFunctionality} disabled={!selectedPolygon}>
        Draw Inner Polygon
      </button>
      <button onClick={plotMetrics} disabled={innerPolygons.length === 0}>
        Plot Metrics
      </button>
      <div ref={mapContainerRef} style={{ width: "100%", height: "800px" }} />
    </div>
  );
};

export default MapboxPolygon;

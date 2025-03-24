import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import 'mapbox-gl/dist/mapbox-gl.css';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import centroid from "@turf/centroid";
import { bbox, randomPoint, booleanPointInPolygon, pointsWithinPolygon, distance } from "@turf/turf";

mapboxgl.accessToken = "pk.eyJ1IjoiamF5YWNoYW5kcmEtamMiLCJhIjoiY2xmYXgwZzY0MXBqYzNzcGNycWx4eHp2biJ9.GYh5aIXFY73n0oJZD-3LYQ";

const MapboxPolygon = () => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);

  const [savedPolygons, setSavedPolygons] = useState([]);
  const [selectedPolygon, setSelectedPolygon] = useState(null);
  const [canDrawInner, setCanDrawInner] = useState(false);
  const [innerPolygons, setInnerPolygons] = useState([]);
  const canDrawInnerRef = useRef(false);
  const selectedPolygonRef = useRef("");
  const [metrics, setMetrics] = useState({
    MasterZone: 4,
    Building1: 28,
    Building2: 29,
    Offices: 10,
    SiteGate: 9,
    Electrical: 12,
    Plumbing: 22,
    Carpentry: 34,
    Concrete: 54,
    OrnamentalMetals: 34,
    ConcreteFinisher: 3
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
              if (canDrawInnerRef.current && selectedPolygonRef.current) {
                if (!booleanPointInPolygon(centroid(polygon).geometry, selectedPolygonRef.current)) {
                  alert("Inner polygon must be inside the outer polygon");
                  return;
                }
                saveInnerPolygon(name, polygon);
              } else {
                savePolygon(name, polygon);
              }
              alert(`Polygon "${name}" saved!`);
              drawRef.current.deleteAll();
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
    loadInnerSavedPolygons();
  };

  const loadInnerSavedPolygons = () => {
    if (!mapRef.current.isStyleLoaded()) {
      console.log("Map style is not loaded yet, waiting...");
      mapRef.current.once("style.load", loadInnerSavedPolygons);
      return;
    }

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

      mapRef.current.addLayer({
        id: `innerPolygon-${name}-outline`,
        type: "line",
        source: `innerPolygon-${name}`,
        paint: {
          "line-color": "#ffff00",
          "line-width": 1,
        },
      });
    });
  }

  const loadSavedPolygons = () => {
    if (!mapRef.current.isStyleLoaded()) {
      console.log("Map style is not loaded yet, waiting...");
      mapRef.current.once("style.load", loadSavedPolygons);
      return;
    }

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

      mapRef.current.addLayer({
        id: `polygon-${name}-outline`,
        type: "line",
        source: `polygon-${name}`,
        paint: {
          "line-color": "#ffff00",
          "line-width": 1,
        },
      });
    });
  };

  const canDrawFunctionality = () => {
    canDrawInnerRef.current = true;
  }


  const getValidPointsInsidePolygon = (polygon, count, radiusValues) => {
    let bboxArea = bbox(polygon[1]);
    let validPoints = [];
    let attempts = 0;

    let shrinkFactor = 0.7;
    let center = centroid(polygon[1]).geometry.coordinates; 
    let adjustedBbox = [
      center[0] - (bboxArea[2] - bboxArea[0]) * shrinkFactor / 2,
      center[1] - (bboxArea[3] - bboxArea[1]) * shrinkFactor / 2,
      center[0] + (bboxArea[2] - bboxArea[0]) * shrinkFactor / 2,
      center[1] + (bboxArea[3] - bboxArea[1]) * shrinkFactor / 2
    ];

    while (validPoints.length < count) {
      let randomPoints = randomPoint(5, { bbox: adjustedBbox }).features;
      let chosenPoint = randomPoints.find(p => booleanPointInPolygon(p, polygon[1], { ignoreBoundary: true }));

      if (chosenPoint) {
        let index = validPoints.length;
        let minRequiredDistance = 0.005;
        let tooClose = validPoints.some((pt, i) =>
          distance(pt, chosenPoint) < minRequiredDistance
        );
        if (!tooClose) validPoints.push(chosenPoint.geometry.coordinates);
      }
      attempts++;
    }
    return validPoints;
  };



  const calculateRadiusRange = (metricValues) => {
    const minRadius = 3;
    const maxRadius = 10;
    const minMetric = Math.min(...metricValues);
    const maxMetric = Math.max(...metricValues);

    return metricValues.map(value => {
      if (maxMetric === minMetric) return minRadius;
      return minRadius + ((value - minMetric) / (maxMetric - minMetric)) * (maxRadius - minRadius);
    });
  };

  const plotMetrics = () => {
    const metricValues = Object.values(metrics);
    const radiusValues = calculateRadiusRange(metricValues);
    innerPolygons.forEach((polygon, index) => {
      let minDistance = 0.001;
      let points = getValidPointsInsidePolygon(polygon, Object.keys(metrics).length, minDistance);

      Object.entries(metrics).forEach(([name, value], metricIndex) => {
        if (!points[metricIndex]) return;
        let baseRadius = radiusValues[metricIndex];
        const color = ["#ff5733", "#33ff57", "#3357ff"][metricIndex % 3];

        mapRef.current.addLayer({
          id: `metric-${name}-${index}`,
          type: "circle",
          source: {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: { type: "Point", coordinates: points[metricIndex] },
            },
          },
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10, baseRadius - 2,
              17, baseRadius - 3,
              18, baseRadius,
              21, baseRadius * 5,
              23, baseRadius * 7
            ],
            "circle-color": color,
            "circle-opacity": 0.7,
          },
        });

        mapRef.current.addLayer({
          id: `metric-text-${name}-${index}`,
          type: "symbol",
          source: {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: { type: "Point", coordinates: points[metricIndex] },
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

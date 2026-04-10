// map.js

let selectedLocation = null;
let map;
let marker;
let geocoder;

// ✅ Initialize the map
function initMap() {
  const defaultCenter = { lat: 24.7136, lng: 46.6753 }; // Riyadh

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 11,
    center: defaultCenter,
  });

  geocoder = new google.maps.Geocoder();

  map.addListener("click", (event) => {
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();

    // Move marker
    if (marker) marker.setMap(null);

    marker = new google.maps.Marker({
      position: { lat, lng },
      map: map,
    });

    // Fill inputs
    document.getElementById("latitude").value = lat;
    document.getElementById("longitude").value = lng;

    // ✅ Get clean address parts
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results[0]) {
        const components = results[0].address_components;

        let street = "";
        let neighborhood = "";
        let city = "";

        components.forEach((comp) => {
          if (comp.types.includes("route")) {
            street = comp.long_name;
          }
          if (
            comp.types.includes("sublocality") ||
            comp.types.includes("neighborhood")
          ) {
            neighborhood = comp.long_name;
          }
          if (comp.types.includes("locality")) {
            city = comp.long_name;
          }
        });

        // fallback for city
        if (!city) {
          const admin = components.find((c) =>
            c.types.includes("administrative_area_level_1")
          );
          city = admin?.long_name || "";
        }

        // ✅ Save structured location
        selectedLocation = {
          lat,
          lng,
          street,
          neighborhood,
          city,
        };

        // ✅ Show clean value in input
        const clean = [street, neighborhood, city]
          .filter(Boolean)
          .join("، ");

        document.getElementById("streetName").value = clean;
      }
    });

    console.log("📍 Selected:", selectedLocation);
  });
}

window.initMap = initMap;

export function getSelectedLocation() {
  return selectedLocation;
}
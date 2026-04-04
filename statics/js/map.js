let selectedLocation = null;
let map;
let marker;

window.initMap = function () {
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 11,
    center: { lat: 24.7136, lng: 46.6753 },
  });

  map.addListener("click", (event) => {
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();

    selectedLocation = { lat, lng };

    if (marker) marker.setMap(null);

    marker = new google.maps.Marker({
      position: { lat, lng },
      map: map,
    });

    console.log("✅ Selected:", selectedLocation);
  });
};

export function getSelectedLocation() {
  return selectedLocation;
}
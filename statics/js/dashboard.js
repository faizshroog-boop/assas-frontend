
      /* ===================================================
         1. Imports
      =================================================== */
      import { db } from "./firebase.js";
      import {
        collection,
        onSnapshot,
        doc,
      } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

      /* ===================================================
         2. Global State & Variables
      =================================================== */
      // Data layers for frontend
      let allReports = []; // All fetched reports
      let filteredReports = []; // Array keeping track of currently filtered items
      let markersMap = {}; // Mapped markers by ID for instant access
      let activePopup = null; // Tracking open popup in GMaps

      // Pagination State
      let currentPage = 1;
      const itemsPerPage = 10;

      // Chart instances
      let highChart, mediumChart, lowChart, completedChart;

      // DOM Elements
      const tableBody = document.getElementById("tableBody");
      const searchInput = document.getElementById("searchInput");

      // Filter DOM Elements
      const filterSeverity = document.getElementById("filterSeverity");
      const filterLocation = document.getElementById("filterLocation");
      const filterStatus = document.getElementById("filterStatus");
      const filterId = document.getElementById("filterId");
      const filterDateFrom = document.getElementById("filterDateFrom");
      const filterDateTo = document.getElementById("filterDateTo");
      const resetFiltersBtn = document.getElementById("resetFiltersBtn");

      // Pagination DOM Elements
      const prevPageBtn = document.getElementById("prevPageBtn");
      const nextPageBtn = document.getElementById("nextPageBtn");
      const pageInfo = document.getElementById("pageInfo");

      

      /* ===================================================
         3. Constants & Translations
      =================================================== */
      // Maps English status keys to Arabic display text
      const statusTranslation = {
        completed: "مكتمل",
        in_progress: "قيد التنفيذ",
        pending: "غير مكتمل",
      };

      // Maps English severity keys to Arabic display text
      const severityTranslation = {
        high: "عالية",
        medium: "متوسطة",
        low: "منخفضة",
      };

      /* ===================================================
         4. Utility / Helper Functions
      =================================================== */
      /**
       * Determines marker/dot color dynamically depending on completion and severity.
       * @param {Object} report Firestore report object
       * @returns {string} Color keyword mapped to CSS/markers
       */
      function getColor(report) {
        if (report.status === "completed") return "green";
        if (report.severity === "high") return "red";
        if (report.severity === "medium") return "orange";
        if (report.severity === "low") return "yellow";
        return "green";
      }

      /**
       * Safely updates a given Doughnut Chart by recalculating percentage logic.
       * Reduces duplicated codebase for handling charts data update.
       * @param {Object} chartInstance Valid Chart.js reference
       * @param {number} count Total elements fitting chart criteria
       * @param {number} total Total data pool size
       */
      function updateChartDataSafe(chartInstance, count, total) {
        if (!chartInstance) return;
        const percent = total ? (count / total) * 100 : 0;
        chartInstance.data.datasets[0].data = [percent, 100 - percent];
        chartInstance.update();
      }

      /* ===================================================
         5. Map Logic
      =================================================== */
      /**
       * Class to generate InfoWindow-like custom popup directly rendering on map coordinates.
       * Tied directly to Google Maps OverlayView architecture.
       */
      class CustomPopup extends google.maps.OverlayView {
        constructor(position, content) {
          super();
          this.position = position;
          this.containerDiv = document.createElement("div");
          this.containerDiv.innerHTML = content;
          this.containerDiv.style.position = "absolute";
          this.containerDiv.style.transform = "translate(-50%, -100%)";
          this.containerDiv.style.zIndex = "1000";
        }

        onAdd() {
          const panes = this.getPanes();
          panes.floatPane.appendChild(this.containerDiv);

          const closeBtn = this.containerDiv.querySelector("#closePopupBtn");
          if (closeBtn) {
            closeBtn.addEventListener("click", () => {
              this.setMap(null);
              activePopup = null;
            });
          }
        }

        draw() {
          const projection = this.getProjection();
          const point = projection.fromLatLngToDivPixel(this.position);

          if (point) {
            this.containerDiv.style.left = point.x + "px";
            this.containerDiv.style.top = point.y + "px";
          }
        }

        onRemove() {
          if (this.containerDiv.parentElement) {
            this.containerDiv.parentElement.removeChild(this.containerDiv);
          }
        }
      }

      /* ===================================================
         6. Chart Logic
      =================================================== */
      /**
       * Constructor generic function for maintaining scalable usage of new datasets
       * using the Chart.js doughnut functionality wrapper.
       */
      function createChart(id, color) {
        const ctx = document.getElementById(id).getContext("2d");

        return new Chart(ctx, {
          type: "doughnut",
          data: {
            datasets: [
              {
                data: [0, 100], // [Target ratio, Remaining filler]
                backgroundColor: [color, "#eeeeee"],
                borderWidth: 0,
                cutout: "75%",
              },
            ],
          },
          options: {
            responsive: false,
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false },
              datalabels: {
                display: function (ctx) {
                  return ctx.dataIndex === 0; // Display dynamically configured 1st sector exclusively
                },
                color: "#000",
                font: { size: 22, weight: "bold" },
                anchor: "center",
                align: "center",
                formatter: (value) => {
                  return Math.round(value) + "%";
                },
              },
            },
          },
          plugins: [
            {
              id: "centerText",
              beforeDraw(chart) {
                const { ctx } = chart;
                const meta = chart.getDatasetMeta(0);

                if (!meta.data.length) return;

                const centerX = meta.data[0].x;
                const centerY = meta.data[0].y;

                const value = chart.data.datasets[0].data[0];
                const text = Math.round(value) + "%";

                ctx.save();
                ctx.font = `bold ${chart.height / 4.5}px Cairo`;
                ctx.fillStyle = "#000";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                ctx.fillText(text, centerX, centerY);
                ctx.restore();
              },
            },
          ],
        });
      }

      // Initialize the 4 charts with default states based on their semantic severity colors
      highChart = createChart("highChart", "#e74c3c");
      mediumChart = createChart("mediumChart", "#f39c12");
      lowChart = createChart("lowChart", "#f1c40f");
      completedChart = createChart("completedChart", "#2ecc71");

      /* ===================================================
         7. Firestore Realtime Listener
      =================================================== */
      onSnapshot(collection(db, "reports"), (snapshot) => {
        allReports = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        let totalReports = allReports.length;
        let counts = { high: 0, medium: 0, low: 0, completed: 0 };

        allReports.forEach((report) => {
          // Bucket matching conditions
          switch (report.severity) {
            case "high":
              counts.high++;
              break;
            case "medium":
              counts.medium++;
              break;
            case "low":
              counts.low++;
              break;
          }

          if (report.status === "completed") {
            counts.completed++;
          }
        });

        // Generate complete map and views rendering
        renderAllReports();

        // Adjust chart layers proportionally
        updateChartDataSafe(highChart, counts.high, totalReports);
        updateChartDataSafe(mediumChart, counts.medium, totalReports);
        updateChartDataSafe(lowChart, counts.low, totalReports);
        updateChartDataSafe(completedChart, counts.completed, totalReports);

        applyFiltersAndSearch(); // apply filters whenever database data refreshes inherently
      });

      /* ===================================================
         7. Rendering Functions
      =================================================== */
      /**
       * Safely wipe, and recreate the entire HTML Table contents mapping elements
       * over our central array model. Renders Map Markers in tandem.
       */
      function renderAllReports() {
        // Generate complete map and views rendering.
        // On completely new data refresh, reset filteredReports and pagination
        filteredReports = [...allReports];
        currentPage = 1;

        // Scrubbing previous markers layer entirely avoiding memory leaks
        Object.values(markersMap).forEach((obj) => {
          obj.marker.setMap(null);
        });

        markersMap = {};



        // Ensure pagination evaluation is properly fired matching the current filter state
        console.log(
          "renderAllReports completed base payload: ",
          allReports.length,
        );
        applyFiltersAndSearch();

        allReports.forEach((report) => {
          // Render Overlay Maps element specifically
          if (report.latitude && report.longitude && !markersMap[report.id]) {
            const color = getColor(report);
            const position = new google.maps.LatLng(
              parseFloat(report.latitude),
              parseFloat(report.longitude),
            );

            let createdDate = null;
            if (report.created_at && typeof report.created_at.toDate === "function") {
              createdDate = report.created_at.toDate();
            } else if (report.created_at_string) {
              createdDate = new Date(report.created_at_string);
            }

            let completedDate = null;
            if (report.completed_at && typeof report.completed_at.toDate === "function") {
              completedDate = report.completed_at.toDate();
            } else if (report.completed_at) {
              completedDate = new Date(report.completed_at);
            }

            // Using default marker style dynamically
            const marker = new google.maps.Marker({
              position: position,
              map: map, // by default attached to map
              icon: {
                url: `https://maps.google.com/mapfiles/ms/icons/${color}-dot.png`,
              },
            });

            // Popup HTML
            const popupContent = `
              <div style="
                  position:relative; 
                  width:min(90vw,320px); 
                  max-height:80vh; 
                  overflow-y:auto; 
                  padding:20px; 
                  font-family:Cairo; 
                  text-align:right; 
                  background:white; 
                  border-radius:14px; 
                  box-shadow:0 15px 35px rgba(0,0,0,0.25);
              ">
                <button id="closePopupBtn" style="
                    position:absolute; 
                    top:10px; 
                    left:10px; 
                    border:none; 
                    background:#eee; 
                    width:30px; 
                    height:30px; 
                    border-radius:50%; 
                    cursor:pointer;">
                  ✕
                </button>
                  <!-- 2. Report ID -->
                <h4 style="margin:8px 0; color:#0c5742; font-size:18px">
                 #${report.id.substring(0,5)}
                </h4>
               <!-- 3. Image -->
                ${report.image_url ? `<img src="${report.image_url}" style="width:100%;height:180px;object-fit:cover;border-radius:10px;margin-bottom:10px;" onerror="this.style.display='none'" />` : ""}

                <!-- 1. Severity Color Bar -->
                <div style="height:6px; border-radius:10px; margin-bottom:10px; background:${getColor(report)};"></div>

              

               
                <!-- 7. Created At -->
                <p style="margin:5px 0;">📅 <b>تاريخ الإنشاء:</b> ${formatDate(createdDate)}</p>

                <!-- 4. Location / Street Name -->
                <p style="margin:5px 0;">📍 <b>الموقع:</b> ${report.street_name || "-"}</p>

                <!-- 5. Status -->
                <p style="margin:5px 0;">🚦 <b>الحالة:</b> ${statusTranslation[report.status] || "-"}</p>

                <!-- 6. Prediction -->
                <p style="margin:5px 0;">🤖 <b>التنبؤ :</b> ${severityTranslation[report.prediction] || "-"}</p>

                <!-- 8. Completed At -->
                <p style="margin:5px 0;">✅ <b>تاريخ الإكتمال:</b> ${formatDate(completedDate)}</p>
              </div>
            `;

            marker.addListener("click", () => {
              // Ensure we close our previous active map context before assigning another
              if (activePopup) {
                activePopup.setMap(null);
              }
              activePopup = new CustomPopup(position, popupContent);
              activePopup.setMap(map);
            });

            // Stabilize our new DOM tracking metadata to standard structure dict
            markersMap[report.id] = { marker, position, popupContent };
          }
        });
      }

      /**
       * Dedicated table builder resolving paginated datasets only.
       */
      function formatDate(date) {
        if (!date) return "-";
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // Months are 0-indexed
        const day = date.getDate();
        return `${year}-${month}-${day}`;
      }
      function renderTablePaginated() {
        tableBody.innerHTML = "";

        const totalItems = filteredReports.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

        console.log(
          "renderTablePaginated fired. totalItems:",
          totalItems,
          "totalPages:",
          totalPages,
          "current:",
          currentPage,
        );

        // Safety bound clamping
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageData = filteredReports.slice(startIndex, endIndex);

        console.log("Rendering table slice of length:", pageData.length);

        pageData.forEach((report) => {
          const color = getColor(report);

          // Convert timestamps to JS Date objects
    let createdDate = null;
    if (report.created_at && typeof report.created_at.toDate === "function") {
      createdDate = report.created_at.toDate();
    } else if (report.created_at_string) {
      createdDate = new Date(report.created_at_string);
    }

    let completedDate = null;
    if (report.completed_at && typeof report.completed_at.toDate === "function") {
      completedDate = report.completed_at.toDate();
    } else if (report.completed_at) {
      completedDate = new Date(report.completed_at);
    }

          // Render Row Data into UI - removed inline event strings (like onclick)
          tableBody.insertAdjacentHTML(
            "beforeend",
            `
            <tr data-id="${report.id}">
              <td class="focus-col">
                #${report.id.substring(0, 5)}
              </td>
              <td>${statusTranslation[report.status] || "-"}</td>
              <td>${report.street_name || "غير محدد"}</td>
              <td>${formatDate(createdDate)}</td>
              <td>${formatDate(completedDate)}</td>
              <td>
                <span class="status-dot ${color}"></span>
                ${severityTranslation[report.severity] || "-"}
              </td>
            </tr> `,
          );
        });

        // Update Pagination Controls UI
        pageInfo.innerText = `صفحة ${currentPage} من ${totalPages}`;

        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
      }

      /* ===================================================
         8. Event Listeners
      =================================================== */
      /**
       * Professional cross-interaction query implementation filtering lists dynamically.
       * Modifies table row visibility and map marker presence based on matches.
       * Integrates both the global search and specific dropdown filters.
       */
      function applyFiltersAndSearch() {
        const searchVal = searchInput.value.trim();
        const severityVal = filterSeverity.value;
        const locationVal = filterLocation.value;
        const statusVal = filterStatus.value;
        const idVal = filterId.value.trim();

        const dateFromVal = filterDateFrom.value
          ? new Date(filterDateFrom.value)
          : null;
        if (dateFromVal) dateFromVal.setHours(0, 0, 0, 0); // Start of day

        const dateToVal = filterDateTo.value
          ? new Date(filterDateTo.value)
          : null;
        if (dateToVal) dateToVal.setHours(23, 59, 59, 999); // End of day

        let firstMatch = null;

        // Reset valid elements tracking stack for table
        filteredReports = [];

        allReports.forEach((report) => {
          const markerObj = markersMap[report.id];

          let isMatch = true;

          // Check Global Search
          if (searchVal !== "") {
            const searchLower = searchVal.toLowerCase();
            const rowIdMatch = report.id.includes(searchVal);
            const rowStreetMatch =
              report.street_name &&
              report.street_name.toLowerCase().includes(searchLower);
            if (!rowIdMatch && !rowStreetMatch) isMatch = false;
          }

          // Check Specific Filters
          if (severityVal && report.severity !== severityVal) isMatch = false;
          if (statusVal && report.status !== statusVal) isMatch = false;
          if (locationVal && (!report.street_name || !report.street_name.includes(locationVal))) {
            isMatch = false;
          }
          if (idVal && !report.id.includes(idVal))
            isMatch = false;

          // Check Date Range Filter
          if (report.created_at && typeof report.created_at.toDate === "function") {
            const reportDate = report.created_at.toDate();
            if (dateFromVal && reportDate < dateFromVal) isMatch = false;
            if (dateToVal && reportDate > dateToVal) isMatch = false;
          }

          // Visual matching: If item passes filters, push its data object to the array pool for pagination
          if (isMatch) {
            filteredReports.push(report);
          }

          // Find first sequence target valid instance (only auto focus map on ID/Search inputs)
          if (isMatch && !firstMatch && (searchVal !== "" || idVal !== "")) {
            firstMatch = report.id;
          }
        });

        // Re-establish map marker visiblity context based on newly applied filters natively
        Object.values(markersMap).forEach((obj) => obj.marker.setMap(null));
        filteredReports.forEach((report) => {
          if (markersMap[report.id] && markersMap[report.id].marker) {
            markersMap[report.id].marker.setMap(map);
          }
        });

        // Trigger dynamic tracking natively across map canvas automatically when user types ID
        if (firstMatch) focusMarker(firstMatch);

        // Re-calculate UI state constraints
        currentPage = 1; // Any filtering query zeroes page counter natively
        renderTablePaginated();
      }

      // Attach global filtering logic to all inputs
      [
        searchInput,
        filterSeverity,
        filterLocation,
        filterStatus,
        filterId,
        filterDateFrom,
        filterDateTo,
      ].forEach((el) => el.addEventListener("input", applyFiltersAndSearch));

      // Attach pagination button listeners
      prevPageBtn.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          renderTablePaginated();
        }
      });

      nextPageBtn.addEventListener("click", () => {
        const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
        if (currentPage < totalPages) {
          currentPage++;
          renderTablePaginated();
        }
      });

      // Reset filters button logic
      resetFiltersBtn.addEventListener("click", () => {
        filterSeverity.value = "";
        filterLocation.value = "";
        filterStatus.value = "";
        filterId.value = "";
        filterDateFrom.value = "";
        filterDateTo.value = "";
        searchInput.value = "";
        applyFiltersAndSearch();
      });

      // Event delegation for dynamically added table contents
      tableBody.addEventListener("click", (e) => {
        const row = e.target.closest("tr");
        if (!row) return;

        const id = row.getAttribute("data-id");
        if (!id) return;

        // Trigger Map Focuser tracking event
        if (e.target.closest(".focus-col")) {
          window.focusMarker(id);
        }
      });

      /* ===================================================
         9. Public Window Functions
      =================================================== */
      /**
       * Centers the map on the selected marker and opens its popup.
       * Exposed to window so it can be called from inline HTML onclick handlers.
       * @param {string} id - The ID of the report/marker to focus on.
       */
      window.focusMarker = function (id) {
        const item = markersMap[id];
        if (!item) return;

        map.setZoom(15);
        map.panTo(item.position);

        if (activePopup) activePopup.setMap(null);

        activePopup = new CustomPopup(item.position, item.popupContent);
        activePopup.setMap(map);
      };



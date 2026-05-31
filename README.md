# ASSAS - Intelligent Frontend Dashboard Workspace 

Welcome to the client-side infrastructure of the **ASSAS** (Road Damage Detection, Prioritization, and Prediction System). This repository houses the decoupled, high-performance user interfaces designed for both municipal administrative staff and field engineers.

## 🛠️ Tech Stack & Architecture
* **Core Language:** Vanilla JavaScript (ES6+) with asynchronous component modules.
* **Data Visualization:** Chart.js for real-time statistical doughnut distributions.
* **Geospatial Mapping:** Google Maps JavaScript API with customized programmatic overlays.
* **State Management:** Reactive Stream Synchronization utilizing Firebase Web Core SDK listeners (`onSnapshot`).

## 📁 Repository Structure
* `/templates`: Houses the core responsive HTML5 documents tailored for specific device views (*Laptops/Desktops for Municipality Employees and Tablets/iPads for Field Engineers*).
* `/statics`: Contains optimized CSS3 stylesheets (including dark mode configurations) and client-side JavaScript execution logic.

##  Getting Started & How to Run
Since this is a decoupled, cloud-connected client application, it can be deployed independently without complex local environments:

### 1. Clone the repository:
```bash
git clone [https://github.com/faizshroop-boop/assas-frontend.git](https://github.com/faizshroop-boop/assas-frontend.git)

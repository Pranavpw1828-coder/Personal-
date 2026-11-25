"use strict";

const WEATHER_CODES = Object.freeze({
  0: ["Clear sky", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"], 45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "❄️"], 75: ["Heavy snow", "❄️"],
  80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm + hail", "⛈️"], 99: ["Thunderstorm + hail", "⛈️"]
});

const describeCode = (code) => WEATHER_CODES[code] ?? ["Unknown", "❓"];

class City {
  constructor(name, country, latitude, longitude) {
    this.name = name;
    this.country = country;
    this.latitude = Number(latitude);
    this.longitude = Number(longitude);
  }

  get id() {
    return `${this.latitude.toFixed(2)},${this.longitude.toFixed(2)}`;
  }
}

class DayForecast {
  constructor(date, code, max, min) {
    this.date = date;
    this.code = code;
    this.max = max;
    this.min = min;
  }

  get dayName() {
    return new Date(`${this.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
  }
}

class WeatherReport {
  constructor(city, current, forecast) {
    this.city = city;
    this.temperature = current.temperature_2m;
    this.feelsLike = current.apparent_temperature;
    this.humidity = current.relative_humidity_2m;
    this.wind = current.wind_speed_10m;
    this.code = current.weather_code;
    this.forecast = forecast;
  }

  get description() { return describeCode(this.code)[0]; }
  get icon() { return describeCode(this.code)[1]; }
}

class WeatherService {
  constructor() {
    this.geoUrl = "https://geocoding-api.open-meteo.com/v1/search";
    this.weatherUrl = "https://api.open-meteo.com/v1/forecast";
  }

  async findCity(name) {
    const url = `${this.geoUrl}?name=${encodeURIComponent(name)}&count=1`;
    console.log("Fetching geocoding:", url);
    
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not reach geocoding API.");
    
    const data = await res.json();
    console.log("Geocoding response:", data);

    if (!data.results || data.results.length === 0) {
      throw new Error(`City "${name}" not found.`);
    }

    const r = data.results[0];
    return new City(r.name, r.country || "", r.latitude, r.longitude);
  }

  async getReport(city, unit) {
    const params = new URLSearchParams({
      latitude: city.latitude,
      longitude: city.longitude,
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code",
      daily: "weather_code,temperature_2m_max,temperature_2m_min",
      forecast_days: 5,
      timezone: "auto",
      temperature_unit: unit === "F" ? "fahrenheit" : "celsius"
    });

    const url = `${this.weatherUrl}?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load weather for ${city.name}.`);

    const data = await res.json();
    const d = data.daily;
    const forecast = d.time.map((date, i) =>
      new DayForecast(date, d.weather_code[i], d.temperature_2m_max[i], d.temperature_2m_min[i])
    );

    return new WeatherReport(city, data.current, forecast);
  }
}

class CityStore {
  constructor(key = "weather-dashboard-cities") {
    this.key = key;
  }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key));
      if (Array.isArray(raw) && raw.length) {
        return raw.map(c => new City(c.name, c.country, c.latitude, c.longitude));
      }
    } catch (e) {
      console.warn("Storage load error, using defaults:", e);
    }
    return [
      new City("Pune", "India", 18.5196, 73.8554),
      new City("Mumbai", "India", 19.0728, 72.8826),
      new City("London", "United Kingdom", 51.5085, -0.1257)
    ];
  }

  save(cities) {
    try {
      localStorage.setItem(this.key, JSON.stringify(cities));
    } catch (e) {
      console.error("Storage save error:", e);
    }
  }
}

class Dashboard {
  constructor(service, store) {
    this.service = service;
    this.store = store;
    this.cities = store.load();
    this.unit = "C";

    this.container = document.getElementById("dashboard");
    this.message = document.getElementById("message");
    this.input = document.getElementById("city-input");

    if (!this.container || !this.message || !this.input) {
      console.error("Critical DOM elements missing!");
      return;
    }

    document.getElementById("add-form").addEventListener("submit", e => {
      e.preventDefault();
      const cityName = this.input.value.trim();
      console.log("Form submitted with city:", cityName);
      this.addCity(cityName);
    });

    document.getElementById("unit-btn").addEventListener("click", e => {
      this.unit = this.unit === "C" ? "F" : "C";
      e.target.textContent = this.unit === "C" ? "Switch to °F" : "Switch to °C";
      this.render();
    });

    document.getElementById("refresh-btn").addEventListener("click", () => this.render());

    this.container.addEventListener("click", e => {
      if (e.target.classList.contains("remove")) {
        this.removeCity(e.target.dataset.id);
      }
    });
  }

  showMessage(text) {
    this.message.textContent = text;
  }

  async addCity(name) {
    if (!name) return;
    try {
      this.showMessage("Searching...");
      const city = await this.service.findCity(name);
      
      if (this.cities.some(c => c.id === city.id)) {
        this.showMessage(`${city.name} is already on the dashboard.`);
        return;
      }

      this.cities.push(city);
      this.store.save(this.cities);
      this.input.value = "";
      await this.render();
    } catch (err) {
      console.error("Add city error:", err);
      this.showMessage(err.message);
    }
  }

  removeCity(id) {
    this.cities = this.cities.filter(c => c.id !== id);
    this.store.save(this.cities);
    this.render();
  }

  async render() {
    this.showMessage("Loading weather...");
    try {
      const results = await Promise.allSettled(
        this.cities.map(c => this.service.getReport(c, this.unit))
      );

      this.container.innerHTML = "";
      let failed = 0;

      results.forEach(r => {
        if (r.status === "fulfilled") {
          this.container.appendChild(this.createCard(r.value));
        } else {
          console.error("Report fetch failed:", r.reason);
          failed++;
        }
      });

      this.showMessage(failed ? `${failed} city/cities could not be loaded.` : "");
    } catch (err) {
      console.error("Render error:", err);
      this.showMessage("Error updating weather data.");
    }
  }

  createCard(report) {
    const u = this.unit;
    const card = document.createElement("article");
    card.className = "card";

    const days = report.forecast.map(d => `
      <div class="day">
        <div>${d.dayName}</div>
        <div class="d-icon">${describeCode(d.code)[1]}</div>
        <div class="range">${Math.round(d.max)}° / ${Math.round(d.min)}°</div>
      </div>`).join("");

    card.innerHTML = `
      <button class="remove" data-id="${report.city.id}" title="Remove">×</button>
      <h2>${report.city.name}</h2>
      <div class="country">${report.city.country}</div>
      <div class="main-row">
        <span class="icon">${report.icon}</span>
        <div>
          <div class="temp">${Math.round(report.temperature)}°${u}</div>
          <div class="desc">${report.description}</div>
        </div>
      </div>
      <div class="stats">
        <div><strong>${Math.round(report.feelsLike)}°${u}</strong>Feels like</div>
        <div><strong>${report.humidity}%</strong>Humidity</div>
        <div><strong>${Math.round(report.wind)} km/h</strong>Wind</div>
      </div>
      <div class="forecast">${days}</div>`;
    return card;
  }
}

// Start app when DOM is fully ready
document.addEventListener("DOMContentLoaded", () => {
  window.app = new Dashboard(new WeatherService(), new CityStore());
  window.app.render();
});
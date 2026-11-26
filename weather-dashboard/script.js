"use strict";

const WEATHER_CODES = Object.freeze({
  0: ["Clear sky", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"], 45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"], 57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "❄️"], 75: ["Heavy snow", "❄️"], 77: ["Snow grains", "🌨️"],
  80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  85: ["Snow showers", "🌨️"], 86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm + hail", "⛈️"], 99: ["Thunderstorm + hail", "⛈️"]
});

// Night versions of the icons that show the sun
const NIGHT_ICONS = Object.freeze({ 0: "🌙", 1: "🌙", 2: "☁️" });

const describeCode = (code, isDay = true) => {
  const [text, icon] = WEATHER_CODES[code] ?? ["Unknown", "❓"];
  return [text, isDay ? icon : (NIGHT_ICONS[code] ?? icon)];
};

// Picks the card background theme from the weather code and day/night
const themeFor = (code, isDay) => {
  if (code === 0 || code === 1) return isDay ? "sunny" : "clear-night";
  if (code === 2 || code === 3) return isDay ? "cloudy" : "cloudy-night";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
};

const esc = (s) => String(s).replace(/[&<>"']/g, ch => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
));

// Times from the API are already in the city's local time ("2026-11-25T18:03"),
// so format them from the text instead of using the browser's time zone.
const fmtTime = (iso) => {
  const [h, m] = iso.slice(11, 16).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
};
const fmtHour = (iso) => {
  const h = Number(iso.slice(11, 13));
  return `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`;
};

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];

const uvLabel = (uv) => {
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very high";
  return "Extreme";
};

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

class HourForecast {
  constructor(time, code, temp, rainChance, isDay) {
    this.time = time;
    this.code = code;
    this.temp = temp;
    this.rainChance = rainChance;
    this.isDay = isDay;
  }
}

class DayForecast {
  constructor(date, code, max, min, rainChance, sunrise, sunset) {
    this.date = date;
    this.code = code;
    this.max = max;
    this.min = min;
    this.rainChance = rainChance;
    this.sunrise = sunrise;
    this.sunset = sunset;
  }

  get dayName() {
    return new Date(`${this.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
  }
}

class WeatherReport {
  constructor(city, current, details, hours, forecast) {
    this.city = city;
    this.temperature = current.temperature_2m;
    this.feelsLike = current.apparent_temperature;
    this.humidity = current.relative_humidity_2m;
    this.wind = current.wind_speed_10m;
    this.windDir = current.wind_direction_10m;
    this.pressure = current.pressure_msl;
    this.code = current.weather_code;
    this.isDay = current.is_day === 1;
    this.uv = details.uv;
    this.visibility = details.visibility;
    this.dewPoint = details.dewPoint;
    this.hours = hours;
    this.forecast = forecast;
  }

  get description() { return describeCode(this.code, this.isDay)[0]; }
  get icon() { return describeCode(this.code, this.isDay)[1]; }
  get theme() { return themeFor(this.code, this.isDay); }
  get today() { return this.forecast[0]; }
}

class WeatherService {
  constructor() {
    this.geoUrl = "https://geocoding-api.open-meteo.com/v1/search";
    this.weatherUrl = "https://api.open-meteo.com/v1/forecast";
  }

  async findCity(name) {
    const url = `${this.geoUrl}?name=${encodeURIComponent(name)}&count=1`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not reach geocoding API.");

    const data = await res.json();

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
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,pressure_msl,weather_code,is_day",
      hourly: "temperature_2m,weather_code,precipitation_probability,is_day,uv_index,visibility,dew_point_2m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
      forecast_days: 5,
      timezone: "auto",
      temperature_unit: unit === "F" ? "fahrenheit" : "celsius"
    });

    const url = `${this.weatherUrl}?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load weather for ${city.name}.`);

    const data = await res.json();
    const d = data.daily;
    const h = data.hourly;

    const forecast = d.time.map((date, i) =>
      new DayForecast(
        date, d.weather_code[i], d.temperature_2m_max[i], d.temperature_2m_min[i],
        d.precipitation_probability_max[i], d.sunrise[i], d.sunset[i]
      )
    );

    // Find the current hour in the hourly arrays (both are in the city's local time)
    const nowHour = data.current.time.slice(0, 13);
    let start = h.time.findIndex(t => t.startsWith(nowHour));
    if (start < 0) start = 0;

    const hours = [];
    for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
      hours.push(new HourForecast(
        h.time[i], h.weather_code[i], h.temperature_2m[i],
        h.precipitation_probability[i], h.is_day[i] === 1
      ));
    }

    const details = {
      uv: h.uv_index[start],
      visibility: h.visibility[start],
      dewPoint: h.dew_point_2m[start]
    };

    return new WeatherReport(city, data.current, details, hours, forecast);
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
      this.addCity(this.input.value.trim());
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
    card.className = `card theme-${report.theme}`;

    const hours = report.hours.map((hr, i) => `
      <div class="hour">
        <div class="h-time">${i === 0 ? "Now" : fmtHour(hr.time)}</div>
        <div class="h-icon">${describeCode(hr.code, hr.isDay)[1]}</div>
        <div class="h-temp">${Math.round(hr.temp)}°</div>
        <div class="h-rain">💧${hr.rainChance ?? 0}%</div>
      </div>`).join("");

    const days = report.forecast.map(d => `
      <div class="day">
        <div>${d.dayName}</div>
        <div class="d-icon">${describeCode(d.code)[1]}</div>
        <div class="range">${Math.round(d.max)}° / ${Math.round(d.min)}°</div>
        <div class="d-rain">💧${d.rainChance ?? 0}%</div>
      </div>`).join("");

    const today = report.today;
    // The API can return null for a value; show a dash instead of a fake 0
    const has = (v) => v !== null && v !== undefined;
    const uvText = has(report.uv) ? `${Math.round(report.uv * 10) / 10}` : "–";
    const uvName = has(report.uv) ? `UV · ${uvLabel(report.uv)}` : "UV index";
    const visKm = has(report.visibility) ? report.visibility / 1000 : null;
    const visText = visKm === null ? "–"
      : visKm >= 10 ? `${Math.round(visKm)} km` : `${visKm.toFixed(1)} km`;
    const pressureText = has(report.pressure) ? `${Math.round(report.pressure)} hPa` : "–";
    const dewText = has(report.dewPoint) ? `${Math.round(report.dewPoint)}°${u}` : "–";

    card.innerHTML = `
      <button class="remove" data-id="${esc(report.city.id)}" title="Remove">×</button>
      <h2>${esc(report.city.name)}</h2>
      <div class="country">${esc(report.city.country)}</div>
      <div class="main-row">
        <span class="icon">${report.icon}</span>
        <div>
          <div class="temp">${Math.round(report.temperature)}°${u}</div>
          <div class="desc">${esc(report.description)}</div>
          <div class="rain-now">💧 ${today.rainChance ?? 0}% chance of rain today</div>
        </div>
      </div>
      <div class="stats">
        <div><strong>${Math.round(report.feelsLike)}°${u}</strong>Feels like</div>
        <div><strong>${report.humidity}%</strong>Humidity</div>
        <div><strong>${Math.round(report.wind)} km/h</strong>Wind ${compass(report.windDir)}</div>
      </div>
      <div class="section-title">Next 24 hours</div>
      <div class="hourly">${hours}</div>
      <div class="section-title">Details</div>
      <div class="details">
        <div><strong>${uvText}</strong>${uvName}</div>
        <div><strong>${pressureText}</strong>Pressure</div>
        <div><strong>${visText}</strong>Visibility</div>
        <div><strong>${dewText}</strong>Dew point</div>
        <div><strong>${fmtTime(today.sunrise)}</strong>Sunrise</div>
        <div><strong>${fmtTime(today.sunset)}</strong>Sunset</div>
      </div>
      <div class="section-title">5-day forecast</div>
      <div class="forecast">${days}</div>`;
    return card;
  }
}

// Start app when DOM is fully ready
document.addEventListener("DOMContentLoaded", () => {
  window.app = new Dashboard(new WeatherService(), new CityStore());
  window.app.render();
});

const CONFIG = {
    API_KEY: '4208d8616b7fcd29c05a0fa73e535be8',
    BASE_URL: 'https://api.openweathermap.org/data/2.5',
    GEO_URL: 'https://api.openweathermap.org/geo/1.0',
    UNITS: 'metric',
    LANG: 'ru',
    DEFAULT_CITIES: ['Москва', 'Санкт-Петербург', 'Новосибирск'],
    STORAGE_KEY: 'weatherAppData'
};

const state = {
    cities: [],
    currentCityIndex: 0,
    isLoading: false,
    error: null,
    isGeolocationAvailable: true,
    weatherData: {}
};

const elements = {
    refreshBtn: document.getElementById('refresh-btn'),
    addCityBtn: document.getElementById('add-city-btn'),
    
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorMessage: document.getElementById('error-message'),
    
    currentWeather: document.getElementById('current-weather'),
    forecast: document.getElementById('forecast'),
    
    locationName: document.getElementById('location-name'),
    locationDate: document.getElementById('location-date'),
    locationTime: document.getElementById('location-time'),
    weatherIcon: document.getElementById('weather-icon'),
    currentTemp: document.getElementById('current-temp'),
    weatherDescription: document.getElementById('weather-description'),
    windSpeed: document.getElementById('wind-speed'),
    humidity: document.getElementById('humidity'),
    pressure: document.getElementById('pressure'),
    visibility: document.getElementById('visibility'),
    
    citiesList: document.getElementById('cities-list'),
    
    modalOverlay: document.getElementById('modal-overlay'),
    modalClose: document.getElementById('modal-close'),
    cancelBtn: document.getElementById('cancel-btn'),
    cityInput: document.getElementById('city-input'),
    cityError: document.getElementById('city-error'),
    addCitySubmit: document.getElementById('add-city-submit'),
    suggestions: document.getElementById('suggestions'),
    
    forecastCards: document.querySelector('.forecast-cards')
};

async function init() {
    loadState();
    setupEventListeners();
    
    if (state.cities.length === 0) {
        requestGeolocation();
    } else {
        await loadWeatherForAllCities();
        showWeather(state.currentCityIndex);
    }
}

function loadState() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        state.cities = parsed.cities || [];
        state.currentCityIndex = parsed.currentCityIndex || 0;
    }
}

function saveState() {
    const data = {
        cities: state.cities,
        currentCityIndex: state.currentCityIndex
    };
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
}

function setupEventListeners() {
    elements.refreshBtn.addEventListener('click', () => {
        loadWeatherForAllCities();
    });
    
    elements.addCityBtn.addEventListener('click', showAddCityModal);
    
    elements.modalClose.addEventListener('click', hideAddCityModal);
    elements.cancelBtn.addEventListener('click', hideAddCityModal);
    elements.modalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.modalOverlay) {
            hideAddCityModal();
    // document.getElementById('reset-btn')?.addEventListener('click', () => {
    // if (confirm('Вы уверены, что хотите сбросить все данные?')) {
    //     localStorage.clear();
    //     location.reload();
        }
    });
    
    elements.cityInput.addEventListener('input', handleCityInput);
    elements.addCitySubmit.addEventListener('click', addCityFromInput);
    
    document.querySelectorAll('.city-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            elements.cityInput.value = chip.dataset.city;
        });
    });
    
    elements.cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addCityFromInput();
        }
    });
}

function requestGeolocation() {
    showLoading();
    
    if (!navigator.geolocation) {
        state.isGeolocationAvailable = false;
        showError('Геолокация не поддерживается вашим браузером');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                const cityName = await getCityNameByCoords(latitude, longitude);
                
                if (!state.cities.some(city => city.name === 'Текущее местоположение')) {
                    state.cities.unshift({
                        name: 'Текущее местоположение',
                        displayName: 'Текущее местоположение',
                        lat: latitude,
                        lon: longitude,
                        isCurrentLocation: true
                    });
                    saveState();
                }
                
                await loadWeatherForAllCities();
                state.currentCityIndex = 0;
                showWeather(0);
            } catch (error) {
                showError('Не удалось определить ваше местоположение');
                showAddCityModal();
            }
        },
        (error) => {
            state.isGeolocationAvailable = false;
            showError('Для отображения погоды разрешите доступ к геолокации или добавьте город вручную');
            showAddCityModal();
        }
    );
}

async function getCityNameByCoords(lat, lon) {
    const url = `${CONFIG.GEO_URL}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${CONFIG.API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data && data[0]) {
        return data[0].local_names?.ru || data[0].name;
    }
    return 'Текущее местоположение';
}

async function loadWeatherForAllCities() {
    if (state.cities.length === 0) {
        hideLoading();      
        showAddCityModal();  
        return;
    }

    showLoading();
    state.error = null;

    try {
        const promises = state.cities.map(async (city, index) => {
            const weatherData = await getWeatherData(city.lat, city.lon);
            state.weatherData[index] = weatherData;
        });

        await Promise.all(promises);
        updateCitiesList();
        showWeather(state.currentCityIndex);
    } catch (error) {
        showError('Ошибка при загрузке данных о погоде');
    }
}


async function getWeatherData(lat, lon) {
    const url = `${CONFIG.BASE_URL}/weather?lat=${lat}&lon=${lon}&units=${CONFIG.UNITS}&lang=${CONFIG.LANG}&appid=${CONFIG.API_KEY}`;
    const forecastUrl = `${CONFIG.BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=${CONFIG.UNITS}&lang=${CONFIG.LANG}&appid=${CONFIG.API_KEY}`;
    
    const [weatherResponse, forecastResponse] = await Promise.all([
        fetch(url),
        fetch(forecastUrl)
    ]);
    
    if (!weatherResponse.ok || !forecastResponse.ok) {
        throw new Error('API error');
    }
    
    const weather = await weatherResponse.json();
    const forecast = await forecastResponse.json();
    
    const dailyForecast = getDailyForecast(forecast.list);
    
    return {
        current: weather,
        forecast: dailyForecast
    };
}

function getDailyForecast(forecastList) {
    const daily = {};
    
    forecastList.forEach(item => {
        const date = new Date(item.dt * 1000).toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'short'
        });
        
        if (!daily[date]) {
            daily[date] = {
                date: date,
                temp_min: item.main.temp_min,
                temp_max: item.main.temp_max,
                description: item.weather[0].description,
                icon: item.weather[0].icon,
                items: [item]
            };
        } else {
            daily[date].temp_min = Math.min(daily[date].temp_min, item.main.temp_min);
            daily[date].temp_max = Math.max(daily[date].temp_max, item.main.temp_max);
            daily[date].items.push(item);
        }
    });
    
    return Object.values(daily).slice(0, 3);
}

function showWeather(cityIndex) {
    if (!state.weatherData[cityIndex]) {
        showError('Данные о погоде не загружены');
        return;
    }
    
    hideLoading();
    hideError();
    
    const city = state.cities[cityIndex];
    const weatherData = state.weatherData[cityIndex];
    
    elements.locationName.innerHTML = `
        <i class="fas fa-${city.isCurrentLocation ? 'location-dot' : 'city'}"></i>
        <span>${city.displayName || city.name}</span>
    `;
    
    const now = new Date();
    elements.locationDate.textContent = now.toLocaleDateString('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    elements.locationTime.textContent = now.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const current = weatherData.current;
    elements.currentTemp.textContent = Math.round(current.main.temp);
    elements.weatherDescription.textContent = current.weather[0].description;
    elements.windSpeed.textContent = `${current.wind.speed} м/с`;
    elements.humidity.textContent = `${current.main.humidity}%`;
    elements.pressure.textContent = `${current.main.pressure} гПа`;
    elements.visibility.textContent = `${(current.visibility / 1000).toFixed(1)} км`;
    
    updateWeatherIcon(elements.weatherIcon, current.weather[0].icon, current.weather[0].main);
    
    elements.currentWeather.style.display = 'block';
    elements.forecast.style.display = 'block';
    
    updateForecast(weatherData.forecast);
}

function updateWeatherIcon(element, iconCode, weatherMain) {
    const iconMap = {
        '01d': 'fas fa-sun',
        '01n': 'fas fa-moon',
        '02d': 'fas fa-cloud-sun',
        '02n': 'fas fa-cloud-moon',
        '03d': 'fas fa-cloud',
        '03n': 'fas fa-cloud',
        '04d': 'fas fa-cloud',
        '04n': 'fas fa-cloud',
        '09d': 'fas fa-cloud-rain',
        '09n': 'fas fa-cloud-rain',
        '10d': 'fas fa-cloud-sun-rain',
        '10n': 'fas fa-cloud-moon-rain',
        '11d': 'fas fa-bolt',
        '11n': 'fas fa-bolt',
        '13d': 'fas fa-snowflake',
        '13n': 'fas fa-snowflake',
        '50d': 'fas fa-smog',
        '50n': 'fas fa-smog'
    };
    
    const defaultIcon = 'fas fa-cloud';
    const iconClass = iconMap[iconCode] || defaultIcon;
    
    element.innerHTML = `<i class="${iconClass}"></i>`;
}

function updateForecast(forecast) {
    elements.forecastCards.innerHTML = '';
    
    forecast.forEach(day => {
        const card = document.createElement('div');
        card.className = 'forecast-card fade-in';
        
        card.innerHTML = `
            <div class="forecast-date">${day.date}</div>
            <div class="forecast-icon">
                <i class="${getForecastIconClass(day.icon)}"></i>
            </div>
            <div class="forecast-temp">
                <div class="temp-high">${Math.round(day.temp_max)}°</div>
                <div class="temp-low">${Math.round(day.temp_min)}°</div>
            </div>
            <div class="forecast-description">${day.description}</div>
        `;
        
        elements.forecastCards.appendChild(card);
    });
}

function getForecastIconClass(iconCode) {
    const iconMap = {
        '01d': 'fas fa-sun',
        '01n': 'fas fa-moon',
        '02': 'fas fa-cloud-sun',
        '03': 'fas fa-cloud',
        '04': 'fas fa-cloud',
        '09': 'fas fa-cloud-rain',
        '10': 'fas fa-cloud-sun-rain',
        '11': 'fas fa-bolt',
        '13': 'fas fa-snowflake',
        '50': 'fas fa-smog'
    };
    
    const prefix = iconCode.substring(0, 2);
    return iconMap[prefix] || iconMap[iconCode] || 'fas fa-cloud';
}

function updateCitiesList() {
    elements.citiesList.innerHTML = '';
    
    state.cities.forEach((city, index) => {
        const weatherData = state.weatherData[index];
        const temp = weatherData ? Math.round(weatherData.current.main.temp) : '--';
        
        const cityElement = document.createElement('div');
        cityElement.className = `city-item ${index === state.currentCityIndex ? 'active' : ''}`;
        cityElement.innerHTML = `
            <div class="city-info">
                <div class="city-name">${city.displayName || city.name}</div>
                <div class="city-temp">${temp}°C</div>
            </div>
            ${!city.isCurrentLocation ? '<button class="city-remove"><i class="fas fa-times"></i></button>' : ''}
        `;
        
        cityElement.addEventListener('click', () => {
            if (index !== state.currentCityIndex) {
                state.currentCityIndex = index;
                saveState();
                updateCitiesList();
                showWeather(index);
            }
        });
        
        const removeBtn = cityElement.querySelector('.city-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeCity(index);
            });
        }
        
        elements.citiesList.appendChild(cityElement);
    });
}

function removeCity(index) {
    if (state.cities[index].isCurrentLocation) return;
    
    state.cities.splice(index, 1);
    
    const newWeatherData = {};
    state.cities.forEach((city, newIndex) => {
        newWeatherData[newIndex] = state.weatherData[newIndex >= index ? newIndex + 1 : newIndex];
    });
    state.weatherData = newWeatherData;
    
    if (state.currentCityIndex >= index) {
        state.currentCityIndex = Math.max(0, state.currentCityIndex - 1);
    }
    
    saveState();
    updateCitiesList();
    
    if (state.cities.length > 0) {
        showWeather(state.currentCityIndex);
    } else {
        requestGeolocation();
    }
}

function showAddCityModal() {
    elements.modalOverlay.style.display = 'flex';
    elements.cityInput.value = '';
    elements.cityError.textContent = '';
    elements.suggestions.innerHTML = '';
    elements.suggestions.style.display = 'none';
    elements.cityInput.focus();
}

function hideAddCityModal() {
    elements.modalOverlay.style.display = 'none';
}

async function handleCityInput() {
    const query = elements.cityInput.value.trim();
    
    if (query.length < 2) {
        elements.suggestions.style.display = 'none';
        return;
    }
    
    try {
        const suggestions = await getCitySuggestions(query);
        showSuggestions(suggestions);
    } catch (error) {
    }
}

async function getCitySuggestions(query) {
    const url = `${CONFIG.GEO_URL}/direct?q=${encodeURIComponent(query)}&limit=5&appid=${CONFIG.API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error('API error');
    }
    
    const data = await response.json();
    return data.filter(city => city.country === 'RU'); 
}

function showSuggestions(cities) {
    elements.suggestions.innerHTML = '';
    
    if (cities.length === 0) {
        elements.suggestions.style.display = 'none';
        return;
    }
    
    cities.forEach(city => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = `${city.name}${city.state ? `, ${city.state}` : ''}`;
        item.dataset.city = city.name;
        item.dataset.lat = city.lat;
        item.dataset.lon = city.lon;
        
        item.addEventListener('click', () => {
            elements.cityInput.value = city.name;
            elements.suggestions.style.display = 'none';
        });
        
        elements.suggestions.appendChild(item);
    });
    
    elements.suggestions.style.display = 'block';
}

async function addCityFromInput() {
    const cityName = elements.cityInput.value.trim();
    
    if (!cityName) {
        elements.cityError.textContent = 'Введите название города';
        return;
    }

    if (state.cities.some(city => city.name === cityName)) {
        elements.cityError.textContent = 'Этот город уже добавлен';
        return;
    }
    
    try {
        elements.cityError.textContent = '';
        elements.addCitySubmit.disabled = true;
        elements.addCitySubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Поиск...';

        const cityData = await getCityCoordinates(cityName);
        
        if (!cityData) {
            elements.cityError.textContent = 'Город не найден';
            return;
        }

        state.cities.push({
            name: cityName,
            displayName: cityData.local_names?.ru || cityName,
            lat: cityData.lat,
            lon: cityData.lon,
            isCurrentLocation: false
        });
        
        saveState();
        hideAddCityModal();

        await loadWeatherForAllCities();

        state.currentCityIndex = state.cities.length - 1;
        showWeather(state.currentCityIndex);
        
    } catch (error) {
        elements.cityError.textContent = 'Ошибка при поиске города';
    } finally {
        elements.addCitySubmit.disabled = false;
        elements.addCitySubmit.innerHTML = 'Добавить';
    }
}

async function getCityCoordinates(cityName) {
    const url = `${CONFIG.GEO_URL}/direct?q=${encodeURIComponent(cityName)}&limit=1&appid=${CONFIG.API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error('API error');
    }
    
    const data = await response.json();
    return data[0];
}

function showLoading() {
    state.isLoading = true;
    elements.loading.style.display = 'flex';
    elements.currentWeather.style.display = 'none';
    elements.forecast.style.display = 'none';
    elements.error.style.display = 'none';
}

function hideLoading() {
    state.isLoading = false;
    elements.loading.style.display = 'none';
}

function showError(message) {
    state.error = message;
    elements.errorMessage.textContent = message;
    elements.error.style.display = 'flex';
    elements.loading.style.display = 'none';
    elements.currentWeather.style.display = 'none';
    elements.forecast.style.display = 'none';
}

function hideError() {
    state.error = null;
    elements.error.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', init);

setInterval(() => {
    if (elements.locationTime) {
        const now = new Date();
        elements.locationTime.textContent = now.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}, 60000);



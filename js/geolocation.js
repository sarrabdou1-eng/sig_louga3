/**
 * Module de Géolocalisation Avancé - SIG Louga PWA
 * Gère la localisation GPS avec suivi continu, cache et synchronisation
 */

class GeolocationManager {
  constructor(mapObject) {
    this.map = mapObject;
    this.watchId = null;
    this.marker = null;
    this.accuracyCircle = null;
    this.isTracking = false;
    this.lastPosition = null;
    this.history = [];
    this.maxHistoryLength = 100;
    
    // Options de géolocalisation
    this.options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };
    
    // Initialiser
    this.init();
  }
  
  /**
   * Initialiser le gestionnaire de géolocalisation
   */
  init() {
    console.log('[Geolocation] Initialisation du gestionnaire');
    
    // Vérifier la disponibilité
    if (!('geolocation' in navigator)) {
      console.warn('[Geolocation] Géolocalisation non supportée');
      this.showNotification('Géolocalisation non supportée', 'warning');
      return false;
    }
    
    // Charger la dernière position depuis le cache
    this.loadCachedPosition();
    
    // Ajouter les contrôles
    this.addControls();
    
    return true;
  }
  
  /**
   * Démarrer le suivi de position continu
   */
  startTracking() {
    console.log('[Geolocation] Démarrage du suivi');
    
    if (this.isTracking) {
      console.warn('[Geolocation] Suivi déjà actif');
      return;
    }
    
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePositionSuccess(position),
      (error) => this.handlePositionError(error),
      this.options
    );
    
    this.isTracking = true;
    document.getElementById('btn-geolocation')?.classList.add('active');
  }
  
  /**
   * Arrêter le suivi de position
   */
  stopTracking() {
    console.log('[Geolocation] Arrêt du suivi');
    
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    
    this.isTracking = false;
    document.getElementById('btn-geolocation')?.classList.remove('active');
  }
  
  /**
   * Obtenir la position actuelle
   */
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.handlePositionSuccess(position);
          resolve(position);
        },
        (error) => {
          this.handlePositionError(error);
          reject(error);
        },
        this.options
      );
    });
  }
  
  /**
   * Traiter une position réussie
   */
  handlePositionSuccess(position) {
    const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
    const timestamp = position.timestamp;
    
    console.log(`[Geolocation] Position: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${accuracy.toFixed(0)}m)`);
    
    // Sauvegarder la position
    this.lastPosition = {
      lat: latitude,
      lng: longitude,
      accuracy: accuracy,
      altitude: altitude,
      heading: heading,
      speed: speed,
      timestamp: timestamp
    };
    
    // Ajouter à l'historique
    this.addToHistory(this.lastPosition);
    
    // Mettre en cache
    this.cachePosition(this.lastPosition);
    
    // Mettre à jour l'affichage
    this.updateMarker(latitude, longitude, accuracy);
    this.updateCoordinatesDisplay(latitude, longitude, accuracy);
    
    // Émettre un événement personnalisé
    window.dispatchEvent(new CustomEvent('geolocation-update', {
      detail: this.lastPosition
    }));
  }
  
  /**
   * Traiter une erreur de géolocalisation
   */
  handlePositionError(error) {
    console.error('[Geolocation] Erreur:', error.message);
    
    let message = 'Erreur de géolocalisation';
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = 'Géolocalisation refusée. Autorisez l\'accès dans les paramètres.';
        break;
      case error.POSITION_UNAVAILABLE:
        message = 'Position non disponible. Vérifiez votre connexion GPS.';
        break;
      case error.TIMEOUT:
        message = 'Délai dépassé pour obtenir la position.';
        break;
    }
    
    this.showNotification(message, 'error');
  }
  
  /**
   * Mettre à jour le marqueur sur la carte
   */
  updateMarker(lat, lng, accuracy) {
    // Retirer l'ancien marqueur
    if (this.marker) {
      this.map.removeLayer(this.marker);
    }
    if (this.accuracyCircle) {
      this.map.removeLayer(this.accuracyCircle);
    }
    
    // Créer le marqueur de position
    this.marker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: `<div class="geoloc-marker-inner">
                 <div class="geoloc-pulse"></div>
                 <i class="fas fa-location-dot"></i>
               </div>`,
        iconSize: [40, 40],
        className: 'geoloc-marker',
        popupAnchor: [0, -20]
      }),
      title: 'Ma position',
      zIndexOffset: 1000
    }).addTo(this.map);
    
    // Ajouter un popup
    this.marker.bindPopup(`
      <div class="geoloc-popup">
        <strong>📍 Ma position</strong><br>
        <small>
          Latitude: ${lat.toFixed(6)}<br>
          Longitude: ${lng.toFixed(6)}<br>
          Précision: ±${accuracy.toFixed(0)}m
        </small>
      </div>
    `);
    
    // Créer le cercle de précision
    this.accuracyCircle = L.circle([lat, lng], {
      radius: accuracy,
      color: '#0b61a4',
      weight: 2,
      opacity: 0.3,
      fill: true,
      fillColor: '#0b61a4',
      fillOpacity: 0.08,
      className: 'geoloc-accuracy'
    }).addTo(this.map);
    
    // Centrer la carte sur la première position
    if (!window.geolocInitialized) {
      this.map.setView([lat, lng], 15);
      window.geolocInitialized = true;
    }
  }
  
  /**
   * Mettre à jour l'affichage des coordonnées
   */
  updateCoordinatesDisplay(lat, lng, accuracy) {
    const coordsElement = document.getElementById('coords');
    if (coordsElement) {
      coordsElement.innerHTML = `
        <i class="fas fa-crosshairs"></i> 
        Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}
        <span class="accuracy-badge" title="Précision GPS">±${accuracy.toFixed(0)}m</span>
      `;
    }
  }
  
  /**
   * Ajouter une position à l'historique
   */
  addToHistory(position) {
    this.history.push({
      ...position,
      addedAt: Date.now()
    });
    
    // Limiter la taille de l'historique
    if (this.history.length > this.maxHistoryLength) {
      this.history.shift();
    }
  }
  
  /**
   * Mettre en cache la position actuelle
   */
  cachePosition(position) {
    // Utiliser localStorage
    try {
      localStorage.setItem('sig-louga-last-position', JSON.stringify(position));
      
      // Également notifier le Service Worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.controller?.postMessage({
          type: 'SYNC_GEOLOCATION',
          payload: position
        });
      }
    } catch (e) {
      console.warn('[Geolocation] Impossible de mettre en cache:', e);
    }
  }
  
  /**
   * Charger la dernière position depuis le cache
   */
  loadCachedPosition() {
    try {
      const cached = localStorage.getItem('sig-louga-last-position');
      if (cached) {
        const position = JSON.parse(cached);
        console.log('[Geolocation] Position en cache récupérée');
        
        // Afficher la position en cache si disponible
        if (!this.isTracking) {
          this.updateMarker(position.lat, position.lng, position.accuracy);
          this.updateCoordinatesDisplay(position.lat, position.lng, position.accuracy);
        }
      }
    } catch (e) {
      console.warn('[Geolocation] Impossible de charger le cache:', e);
    }
  }
  
  /**
   * Obtenir la distance entre deux points (en mètres)
   */
  getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Rayon de la Terre en mètres
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  /**
   * Exporter l'historique en GeoJSON
   */
  exportAsGeoJSON() {
    const features = this.history.map((pos, idx) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [pos.lng, pos.lat]
      },
      properties: {
        index: idx,
        accuracy: pos.accuracy,
        altitude: pos.altitude,
        timestamp: pos.timestamp,
        speed: pos.speed
      }
    }));
    
    return {
      type: 'FeatureCollection',
      features: features,
      properties: {
        name: 'Historique de géolocalisation SIG Louga',
        createdAt: new Date().toISOString()
      }
    };
  }
  
  /**
   * Afficher une notification
   */
  showNotification(message, type = 'info') {
    console.log(`[Geolocation] ${type.toUpperCase()}: ${message}`);
    
    // Créer une notification toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
      ${message}
    `;
    
    document.body.appendChild(toast);
    
    // Animer
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Supprimer après 4s
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
  
  /**
   * Ajouter les contrôles de géolocalisation
   */
  addControls() {
    const button = document.getElementById('btn-geolocation');
    if (button) {
      button.addEventListener('click', () => {
        if (this.isTracking) {
          this.stopTracking();
        } else {
          this.startTracking();
        }
      });
      
      // Double-clic pour centrer sans suivi continu
      button.addEventListener('dblclick', () => {
        this.getCurrentPosition().then(() => {
          if (!this.isTracking) {
            this.map.setView([this.lastPosition.lat, this.lastPosition.lng], 17);
          }
        }).catch((error) => {
          console.error('[Geolocation] Erreur:', error);
        });
      });
    }
  }
  
  /**
   * Obtenir des statistiques sur le trajet
   */
  getTrackStats() {
    if (this.history.length < 2) {
      return { distance: 0, duration: 0, pointCount: this.history.length };
    }
    
    let totalDistance = 0;
    for (let i = 1; i < this.history.length; i++) {
      const dist = this.getDistance(
        this.history[i - 1].lat,
        this.history[i - 1].lng,
        this.history[i].lat,
        this.history[i].lng
      );
      totalDistance += dist;
    }
    
    const startTime = this.history[0].timestamp;
    const endTime = this.history[this.history.length - 1].timestamp;
    const duration = (endTime - startTime) / 1000; // en secondes
    
    return {
      distance: totalDistance,
      duration: duration,
      pointCount: this.history.length,
      averageSpeed: totalDistance / (duration / 3600) // km/h
    };
  }
  
  /**
   * Nettoyer et réinitialiser
   */
  destroy() {
    this.stopTracking();
    if (this.marker) {
      this.map.removeLayer(this.marker);
    }
    if (this.accuracyCircle) {
      this.map.removeLayer(this.accuracyCircle);
    }
    this.history = [];
    console.log('[Geolocation] Gestionnaire détruit');
  }
}

// Exporter pour utilisation
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GeolocationManager;
}

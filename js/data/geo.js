(function(C){C.DATA=C.DATA||{};
C.GEO={lat0:33.874975,lon0:132.7074333,mLat:110920.11,mLon:92519.88,
toLocal(lat,lon){return[(lon-this.lon0)*this.mLon,-(lat-this.lat0)*this.mLat];},
toLatLon(x,z){return[this.lat0-z/this.mLat,this.lon0+x/this.mLon];}};})(window.CITY);

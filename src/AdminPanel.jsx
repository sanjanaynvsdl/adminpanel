import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MapDetails from './MapDetails';

// Hardcoded order hash
const ORDER_HASH = 'orderId9:riderId2';

export default function AdminPanel({ userData, onLogout }) {
  const [isTracking, setIsTracking] = useState(false);
  const [riderInfo, setRiderInfo] = useState(null);
  const navigate = useNavigate();

  // Handle Track Rider button click
  const handleTrackRider = () => {
    setIsTracking(true);
    console.log("Started tracking rider with hash:", ORDER_HASH);
  };

  // Memoize the callback to prevent it from changing on every render
  const handleRiderInfoUpdate = useCallback((info) => {
    console.log("Received rider info update:", info);
    setRiderInfo(info);
  }, []);

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    onLogout();
    navigate('/');
  };

  return(
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="bg-[#cbc1bd] p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        {userData && (
          <div className="flex items-center">
            <span className="mr-4 text-gray-800">
              Welcome, {userData.fullName || userData.email}
            </span>
            <button 
              onClick={handleLogout}
              className="bg-white text-[#745a5a] px-3 py-1 rounded-md shadow hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 p-4 flex flex-col">
        <div className="flex flex-row gap-4">
          <div className="flex-1">
           
            <button 
              onClick={handleTrackRider}
              disabled={isTracking}
              className={`${isTracking ? 'bg-gray-400' : 'bg-[#745a5a]'} text-white p-4 rounded-md mt-2 cursor-pointer`}>
              {isTracking ? 'Tracking for orderId9:riderId2' : 'Track Rider with orderId9:riderId2'}
            </button>
            
            {riderInfo && (
              <div className="mt-4 p-4 bg-white rounded-md shadow">
                <h2 className="text-xl font-semibold mb-2">Rider Information</h2>
                <p><strong>Current Location:</strong> {riderInfo.latitude.toFixed(6)}, {riderInfo.longitude.toFixed(6)}</p>
                {riderInfo.routeInfo && (
                  <>
                    <p><strong>Last Updated:</strong> {new Date(riderInfo.timestamp).toLocaleTimeString()}</p>
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Map container */}
          <div className="w-1/3 h-96 rounded-md overflow-hidden shadow-lg">
            {isTracking ? (
              <MapDetails 
                orderHash={ORDER_HASH}
                isTracking={isTracking}
                onRiderInfoUpdate={handleRiderInfoUpdate}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200">
                <p className="text-gray-600 px-4 text-center">Click "Track Rider" to see the map</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
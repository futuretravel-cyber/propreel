'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function ListingsGallery() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchListings() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('listings')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        setListings(data || []);
      } catch (err) {
        console.error('Error fetching listings:', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <p className="text-lg text-gray-600 animate-pulse">Loading property showcases...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 my-4">
        <p>Failed to load listings: {error}</p>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <p className="text-gray-500 text-lg">No property listings found in Supabase yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h2 className="text-3xl font-bold tracking-tight text-gray-900 mb-6">Property Showcases</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {listings.map((listing) => {
          // Parse image URLs safely if stored as a JSON array string or array
          const images = Array.isArray(listing.image_urls) 
            ? listing.image_urls 
            : JSON.parse(listing.image_urls || '[]');
          
          const primaryImage = images.length > 0 ? images[0] : 'https://placehold.co/600x400?text=No+Image';

          return (
            <div key={listing.id} className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 flex flex-col">
              <div className="relative h-48 w-full bg-gray-200">
                <img 
                  src={primaryImage} 
                  alt={listing.title}
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-3 right-3 bg-black/75 text-white text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {listing.property_type || 'Property'}
                </span>
              </div>
              
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-gray-900 truncate">{listing.title}</h3>
                    <span className="text-lg font-extrabold text-blue-600">
                      {listing.price ? `R ${Number(listing.price).toLocaleString()}` : 'Price on Application'}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-1">{listing.address}</p>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4 border-t border-b border-gray-100 py-2">
                    {listing.bedrooms !== null && <span>🛏️ {listing.bedrooms} Beds</span>}
                    {listing.bathrooms !== null && <span>🛁 {listing.bathrooms} Baths</span>}
                  </div>
                </div>

                <button 
                  onClick={() => alert(`Selected listing ID: ${listing.id}`)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  Generate Video Showcase
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

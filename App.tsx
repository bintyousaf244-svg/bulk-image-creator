
import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  GeneratedImage, 
  AppSettings, 
  RefImage 
} from './types';
import { 
  STYLE_OPTIONS, 
  COLOR_THEMES, 
  ASPECT_RATIOS, 
  DELAY_OPTIONS 
} from './constants';

const App: React.FC = () => {
  // --- State ---
  const [settings, setSettings] = useState<AppSettings>({
    characterPrompt: '',
    bulkPrompts: '',
    aspectRatio: '1:1',
    delayTime: 10,
    style: 'Realistic',
    colorTheme: 'Bright',
  });
  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // New states for expanded image and editing
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Refs for managing loop lifecycle
  const stopRequested = useRef(false);
  const pauseRequested = useRef(false);

  // --- Handlers ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length + refImages.length > 4) {
      alert("Maximum 4 reference assets allowed.");
      return;
    }

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setRefImages(prev => [
          ...prev, 
          { id: Math.random().toString(36), data: base64, mimeType: file.type }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeRefImage = (id: string) => {
    setRefImages(prev => prev.filter(img => img.id !== id));
  };

  const downloadImage = (base64: string, name: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = `${name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Core Generation Engine ---
  const startGeneration = async () => {
    const promptList = settings.bulkPrompts.split('\n').filter(p => p.trim() !== '');
    if (promptList.length === 0) {
      alert("Please enter prompts in the Batch Script section.");
      return;
    }

    setIsGenerating(true);
    setIsPaused(false);
    stopRequested.current = false;
    pauseRequested.current = false;
    
    setImages(promptList.map((p, i) => ({ id: i, prompt: p, url: '', status: 'pending' })));
    
    for (let i = 0; i < promptList.length; i++) {
      if (stopRequested.current) break;
      while (pauseRequested.current && !stopRequested.current) {
        await new Promise(r => setTimeout(r, 500));
      }
      if (stopRequested.current) break;

      setCurrentIndex(i);
      setImages(prev => prev.map((img, idx) => idx === i ? { ...img, status: 'generating' } : img));
      
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const finalPrompt = `
          CORE CHARACTER: ${settings.characterPrompt}
          SCENE ACTION: ${promptList[i]}
          VISUAL STYLE: ${settings.style}
          COLOR ATMOSPHERE: ${settings.colorTheme}
          Maintain consistent character details.
        `;

        const parts: any[] = [{ text: finalPrompt }];
        refImages.forEach(ref => {
          parts.push({ inlineData: { data: ref.data, mimeType: ref.mimeType } });
        });

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts },
          config: { imageConfig: { aspectRatio: settings.aspectRatio as any } }
        });

        let imageUrl = '';
        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
            }
          }
        }

        if (imageUrl) {
          setImages(prev => prev.map((img, idx) => idx === i ? { ...img, url: imageUrl, status: 'completed' } : img));
          await new Promise(r => setTimeout(r, settings.delayTime * 1000));
          downloadImage(imageUrl, `${i + 1}`);
        } else {
          throw new Error("No image data returned.");
        }
      } catch (error) {
        console.error(error);
        setImages(prev => prev.map((img, idx) => idx === i ? { ...img, status: 'failed' } : img));
      }
    }
    setIsGenerating(false);
  };

  // --- Image Editing Feature ---
  const processImageEdit = async (instruction: string) => {
    if (!selectedImage || !selectedImage.url) return;
    setIsEditing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = selectedImage.url.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: 'image/png' } },
            { text: instruction }
          ]
        }
      });

      let newUrl = '';
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            newUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (newUrl) {
        const updatedImage = { ...selectedImage, url: newUrl };
        setSelectedImage(updatedImage);
        // Update the image in the main list too
        setImages(prev => prev.map(img => img.id === selectedImage.id ? updatedImage : img));
      }
    } catch (error) {
      console.error("Edit failed:", error);
      alert("Editing failed. Please try again.");
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#fffcfd] overflow-hidden">
      
      {/* LEFT SIDEBAR - FEATURES */}
      <aside className="w-[440px] h-full bg-white/90 backdrop-blur-3xl border-r border-gray-100 flex flex-col p-8 overflow-y-auto custom-scrollbar shadow-2xl z-30">
        
        {/* Logo/Header */}
        <div className="flex items-center gap-4 mb-10">
          <div className="w-14 h-14 bg-gradient-to-br from-[#dcfce7] to-[#f3e8ff] rounded-[20px] flex items-center justify-center shadow-md">
             <svg className="w-7 h-7 text-[#1a1c23]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
             </svg>
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-tight">Bulk Image Creator</h1>
            <p className="text-[10px] font-black text-purple-600 uppercase tracking-[0.25em] mt-1">Studio Edition</p>
          </div>
        </div>

        <div className="space-y-8 flex-1">
          {/* 1. Reference Assets */}
          <section>
            <div className="flex justify-between items-center mb-3 px-1">
              <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.15em] flex items-center gap-2">
                Reference Assets
              </h2>
              <span className="text-[11px] font-black text-blue-600">{refImages.length}/4</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {refImages.map(img => (
                <div key={img.id} className="relative group aspect-square">
                  <img src={`data:${img.mimeType};base64,${img.data}`} className="w-full h-full object-cover rounded-[16px] shadow-sm border border-white" alt="Asset" />
                  <button onClick={() => removeRefImage(img.id)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-lg ring-1 ring-white">✕</button>
                </div>
              ))}
              {refImages.length < 4 && (
                <label className="aspect-square border-2 border-dashed border-blue-200 bg-[#f0f9ff] rounded-[16px] flex items-center justify-center cursor-pointer hover:border-blue-400 transition-all group">
                  <input type="file" className="hidden" multiple accept="image/*" onChange={handleFileChange} />
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                    <span className="text-lg font-bold">+</span>
                  </div>
                </label>
              )}
            </div>
          </section>

          {/* 2. Character Profile */}
          <section>
            <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.15em] mb-3 px-1">Character Profile</h2>
            <textarea
              className="w-full h-24 p-4 bg-[#f0f9ff] border border-blue-100 rounded-[20px] outline-none text-sm font-semibold text-gray-900 placeholder-blue-400/50 focus:ring-2 focus:ring-blue-100 transition-all resize-none shadow-sm"
              placeholder="Describe persistent character details..."
              value={settings.characterPrompt}
              onChange={(e) => setSettings({ ...settings, characterPrompt: e.target.value })}
            />
          </section>

          {/* 3. Batch Script */}
          <section>
            <h2 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.15em] mb-3 px-1">Batch Script</h2>
            <textarea
              className="w-full h-36 p-4 bg-[#f0f9ff] border border-blue-100 rounded-[20px] outline-none text-sm font-semibold text-gray-900 placeholder-blue-400/50 focus:ring-2 focus:ring-blue-100 transition-all custom-scrollbar shadow-sm"
              placeholder="One prompt per line for the bulk sequence..."
              value={settings.bulkPrompts}
              onChange={(e) => setSettings({ ...settings, bulkPrompts: e.target.value })}
            />
          </section>

          {/* 4. Settings Controls */}
          <section className="grid grid-cols-2 gap-4">
             <div>
                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1 mb-1.5 block">Aspect Ratio</label>
                <div className="relative">
                  <select 
                    className="w-full p-3 bg-[#f0f9ff] border border-blue-100 rounded-[14px] text-xs font-black text-gray-800 outline-none appearance-none cursor-pointer"
                    value={settings.aspectRatio}
                    onChange={(e) => setSettings({ ...settings, aspectRatio: e.target.value })}
                  >
                    {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input 
                    type="text" 
                    placeholder="Custom" 
                    className="mt-1.5 w-full p-2 bg-white border border-blue-50 rounded-lg text-[10px] font-bold text-gray-800 placeholder-gray-400 outline-none"
                    onBlur={(e) => e.target.value && setSettings({...settings, aspectRatio: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1 mb-1.5 block">Download Delay</label>
                <div className="relative">
                  <select 
                    className="w-full p-3 bg-[#f0f9ff] border border-blue-100 rounded-[14px] text-xs font-black text-gray-800 outline-none appearance-none cursor-pointer"
                    value={settings.delayTime}
                    onChange={(e) => setSettings({ ...settings, delayTime: parseInt(e.target.value) })}
                  >
                    {DELAY_OPTIONS.map(d => <option key={d} value={d}>{d} Seconds</option>)}
                  </select>
                  <input 
                    type="number" 
                    placeholder="Custom Sec" 
                    className="mt-1.5 w-full p-2 bg-white border border-blue-50 rounded-lg text-[10px] font-bold text-gray-800 placeholder-gray-400 outline-none"
                    onBlur={(e) => e.target.value && setSettings({...settings, delayTime: parseInt(e.target.value)})}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1 mb-1.5 block">Visual Style</label>
                <div className="relative">
                  <select 
                    className="w-full p-3 bg-[#f0f9ff] border border-blue-100 rounded-[14px] text-xs font-black text-gray-800 outline-none appearance-none cursor-pointer"
                    value={settings.style}
                    onChange={(e) => setSettings({ ...settings, style: e.target.value })}
                  >
                    {STYLE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                   <input 
                    type="text" 
                    placeholder="Custom Style" 
                    className="mt-1.5 w-full p-2 bg-white border border-blue-50 rounded-lg text-[10px] font-bold text-gray-800 placeholder-gray-400 outline-none"
                    onBlur={(e) => e.target.value && setSettings({...settings, style: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1 mb-1.5 block">Color Tone</label>
                <div className="relative">
                  <select 
                    className="w-full p-3 bg-[#f0f9ff] border border-blue-100 rounded-[14px] text-xs font-black text-gray-800 outline-none appearance-none cursor-pointer"
                    value={settings.colorTheme}
                    onChange={(e) => setSettings({ ...settings, colorTheme: e.target.value })}
                  >
                    {COLOR_THEMES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input 
                    type="text" 
                    placeholder="Custom Tone" 
                    className="mt-1.5 w-full p-2 bg-white border border-blue-50 rounded-lg text-[10px] font-bold text-gray-800 placeholder-gray-400 outline-none"
                    onBlur={(e) => e.target.value && setSettings({...settings, colorTheme: e.target.value})}
                  />
                </div>
              </div>
          </section>
        </div>

        {/* Action Buttons */}
        <div className="mt-10">
          {!isGenerating ? (
            <button 
              onClick={startGeneration} 
              className="w-full py-5 px-6 bg-gradient-to-r from-[#4ade80] to-[#a855f7] hover:shadow-xl text-white font-black text-lg rounded-[22px] shadow-md shadow-green-100/50 transition-all transform active:scale-95 flex items-center justify-center gap-3"
            >
              START BATCH
            </button>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => { pauseRequested.current = !pauseRequested.current; setIsPaused(pauseRequested.current); }} className="flex-1 py-5 bg-yellow-400 text-white font-black rounded-[22px] shadow-lg active:scale-95 transition-all">
                {isPaused ? 'RESUME' : 'PAUSE'}
              </button>
              <button onClick={() => { stopRequested.current = true; setIsGenerating(false); }} className="flex-1 py-5 bg-red-500 text-white font-black rounded-[22px] shadow-lg active:scale-95 transition-all">
                STOP
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT SIDE - CREATION FEED */}
      <main className="flex-1 relative overflow-y-auto bg-gradient-to-br from-[#fdf4ff] via-white to-[#f0fff4]/10 p-12 custom-scrollbar">
        
        <header className="mb-14">
          <h2 className="text-[56px] font-black text-gray-900 tracking-[-0.04em] leading-none mb-3">Creation Feed</h2>
          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${isGenerating ? 'bg-blue-500 animate-pulse' : 'bg-[#4ade80]'} shadow-md`}></span>
            <span className="text-[11px] font-black text-gray-500 tracking-[0.2em] uppercase">
              {isGenerating ? 'Rendering frames' : 'AI Engine Online'}
            </span>
          </div>
        </header>

        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-12">
            <div className="w-[440px] h-[440px] bg-white rounded-[80px] shadow-2xl shadow-purple-50 flex flex-col items-center justify-center border border-gray-50 relative overflow-hidden float-animation group">
               <div className="absolute inset-0 bg-gradient-to-br from-purple-50/10 via-transparent to-green-50/10"></div>
               <div className="w-20 h-20 bg-gradient-to-br from-[#4ade80] to-[#a855f7] rounded-[28px] flex items-center justify-center text-white text-4xl font-black shadow-xl z-10">
                 +
               </div>
               <div className="mt-12 text-center z-10">
                 <h3 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Vision Workspace Ready</h3>
                 <p className="text-base font-bold text-gray-400 opacity-60">Your frames will appear here.</p>
               </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-10 pb-24">
            {images.map((img, idx) => (
              <div 
                key={img.id} 
                className="group bg-white rounded-[40px] p-7 shadow-xl shadow-gray-100 border border-gray-50 hover:shadow-purple-100/30 transition-all duration-300 hover:-translate-y-2 cursor-pointer"
                onClick={() => img.url && setSelectedImage(img)}
              >
                
                <div className="flex justify-between items-center mb-5">
                  <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-3.5 py-1 rounded-full uppercase tracking-wider">Frame #{idx + 1}</span>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${
                    img.status === 'completed' ? 'text-green-500' :
                    img.status === 'generating' ? 'text-blue-500' :
                    img.status === 'failed' ? 'text-red-500' : 'text-gray-300'
                  }`}>
                    {img.status}
                  </span>
                </div>

                <div className="relative overflow-hidden rounded-[32px] bg-gray-50 shadow-inner" style={{ aspectRatio: settings.aspectRatio.replace(':', '/') }}>
                  {img.url ? (
                    <img src={img.url} className="w-full h-full object-cover" alt={`Frame ${idx + 1}`} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50/50">
                      <div className="w-10 h-10 border-[4px] border-blue-50 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                      <span className="text-[9px] font-black text-gray-400 tracking-[0.3em] uppercase">Rendering</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 px-1">
                   <p className="text-[9px] font-black text-gray-400 mb-1.5 tracking-widest uppercase">Batch Instruction</p>
                   <p className="text-xs font-bold text-gray-800 line-clamp-2 leading-relaxed italic">
                     "{img.prompt}"
                   </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* EXPANDED IMAGE MODAL */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <button 
            onClick={() => setSelectedImage(null)}
            className="absolute top-8 right-8 text-white hover:text-gray-300 transition-colors z-[110]"
          >
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          <div className="bg-white rounded-[40px] max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-2xl">
            {/* Image Preview */}
            <div className="flex-1 bg-gray-900 flex items-center justify-center p-4 min-h-[400px]">
              {isEditing ? (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 border-[6px] border-white/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                  <span className="text-white font-bold tracking-widest uppercase text-sm">Processing Edits...</span>
                </div>
              ) : (
                <img src={selectedImage.url} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt="Expanded view" />
              )}
            </div>

            {/* Sidebar Controls */}
            <div className="w-full md:w-[380px] bg-white p-10 flex flex-col justify-between overflow-y-auto custom-scrollbar">
              <div className="space-y-8">
                <div>
                  <h3 className="text-2xl font-black text-gray-900 mb-2">Editor Options</h3>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Fine-tune your creation</p>
                </div>

                {/* 1. Remove Background */}
                <button 
                  onClick={() => processImageEdit("Remove the background from this image. Keep only the main subject on a clean white background.")}
                  disabled={isEditing}
                  className="w-full py-4 bg-[#f0f9ff] border border-blue-100 text-blue-600 font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-blue-50 transition-all disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Remove Background
                </button>

                {/* 2. Edit Image */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1 block">Edit with Prompt</label>
                  <textarea 
                    className="w-full h-24 p-4 bg-[#f0f9ff] border border-blue-100 rounded-2xl text-sm font-semibold text-gray-900 placeholder-blue-300 outline-none resize-none"
                    placeholder="e.g. 'Add a red hat' or 'Change background to Mars'..."
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                  />
                  <button 
                    onClick={() => {
                      if (editPrompt.trim()) {
                        processImageEdit(editPrompt);
                        setEditPrompt('');
                      }
                    }}
                    disabled={isEditing || !editPrompt.trim()}
                    className="w-full py-4 bg-gradient-to-r from-[#4ade80] to-[#a855f7] text-white font-black rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                  >
                    Apply Edit
                  </button>
                </div>
              </div>

              {/* 3. Download */}
              <button 
                onClick={() => downloadImage(selectedImage.url, `edit_${selectedImage.id}`)}
                className="w-full py-5 border-2 border-gray-900 text-gray-900 font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-900 hover:text-white transition-all mt-10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download Version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

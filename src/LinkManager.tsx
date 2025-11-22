import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, Plus, Trash2, Edit2, ExternalLink, 
  Folder, FolderOpen, Menu, X, 
  GripVertical, Download, Upload, Copy,
  LayoutGrid, Link as LinkIcon,
  AlertTriangle, Globe
} from 'lucide-react';

// --- 类型定义 (Types) ---

type SubLink = {
  id: string;
  title: string;
  url: string;
};

type LinkItem = {
  id: string;
  title: string;
  url: string;
  description?: string;
  categoryId: string;
  createdAt: number;
  order: number;
  subLinks: SubLink[];
};

type Category = {
  id: string;
  name: string;
  order: number;
};

type AppData = {
  categories: Category[];
  links: LinkItem[];
};

type DragItem = {
  type: 'CATEGORY' | 'LINK';
  id: string;
  categoryId?: string; 
};

// 新增类型：记录拖拽放置的位置（前/后）
type DropPosition = 'BEFORE' | 'AFTER' | null;

// --- 工具函数 & Storage Provider ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const STORAGE_KEY = 'link-manager-data';

const SEED_DATA: AppData = {
  categories: [
    { id: 'cat_dev', name: 'Development', order: 0 },
    { id: 'cat_design', name: 'Design', order: 1 },
    { id: 'cat_news', name: 'Reading', order: 2 },
  ],
  links: [
    {
      id: 'link_1',
      title: 'GitHub',
      url: 'https://github.com',
      description: 'Where the world builds software.',
      categoryId: 'cat_dev',
      createdAt: Date.now(),
      order: 0,
      subLinks: [
        { id: 'sub_1', title: 'Issues', url: 'https://github.com/issues' },
        { id: 'sub_2', title: 'Pull Requests', url: 'https://github.com/pulls' },
      ]
    },
    {
      id: 'link_2',
      title: 'React',
      url: 'https://react.dev',
      description: 'The library for web and native user interfaces.',
      categoryId: 'cat_dev',
      createdAt: Date.now(),
      order: 1,
      subLinks: []
    },
    {
      id: 'link_3',
      title: 'Figma',
      url: 'https://www.figma.com',
      description: 'Collaborative interface design tool.',
      categoryId: 'cat_design',
      createdAt: Date.now(),
      order: 0,
      subLinks: []
    },
  ]
};

// 修改为连接本地后端 (如果后端未启动，请自行修改回 localStorage 逻辑或启动后端)
const API_URL = "/api/data";

const StorageProvider = {
  get: async (): Promise<AppData> => {
    try {
      // 尝试连接本地后端，如果失败则回退到种子数据或 LocalStorage (此处简化为种子数据)
      const res = await fetch(API_URL).catch(() => null);
      if (!res || !res.ok) {
        console.warn("API unavailable, utilizing local seed/storage");
        const local = localStorage.getItem(STORAGE_KEY);
        return local ? JSON.parse(local) : SEED_DATA;
      }
      const data = await res.json();
      return data.categories ? data : SEED_DATA;
    } catch (e) {
      console.error("Data load error", e);
      return SEED_DATA;
    }
  },
  set: async (data: AppData) => {
    // 同时保存到 LocalStorage 作为备份
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).catch(() => {});
    } catch (e) {
      // ignore
    }
  }
};

const getFaviconUrl = (url: string) => {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return ''; 
  }
};

// 格式化 URL 显示（去除 https:// 和 尾部 /）
const formatUrlDisplay = (url: string) => {
  try {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  } catch {
    return url;
  }
};

// --- 独立组件: Modal ---

const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode, maxWidth?: string }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto flex flex-col border border-white/20`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- 独立组件: LinkCard ---

interface LinkCardProps {
  link: LinkItem;
  draggedItem: DragItem | null;
  dragOverId: string | null;
  dropPosition: DropPosition; 
  onDragStart: (e: React.DragEvent, item: DragItem) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void; 
  onDrop: (e: React.DragEvent, targetId: string, type: 'LINK') => void;
  onEdit: (link: LinkItem) => void;
  onDelete: (id: string, title: string) => void;
  onDuplicate: (url: string) => void;
}

const LinkCard = React.memo(({ 
  link, 
  draggedItem, 
  dragOverId, 
  dropPosition, 
  onDragStart, 
  onDragOver, 
  onDragEnd, 
  onDrop,
  onEdit,
  onDelete,
  onDuplicate
}: LinkCardProps) => {
  const isDragging = draggedItem?.id === link.id;
  const isOver = dragOverId === link.id && draggedItem?.type === 'LINK';

  // 动态计算样式：左边框还是右边框
  let borderClass = '';
  if (isOver) {
    if (dropPosition === 'BEFORE') {
      borderClass = 'border-l-4 border-l-indigo-500 pl-[calc(1rem-4px)]';
    } else if (dropPosition === 'AFTER') {
      borderClass = 'border-r-4 border-r-indigo-500 pr-[calc(1rem-4px)]'; 
    }
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, { type: 'LINK', id: link.id })}
      onDragOver={(e) => onDragOver(e, link.id)}
      onDragEnd={onDragEnd} 
      onDrop={(e) => onDrop(e, link.id, 'LINK')}
      className={`
        group bg-white rounded-2xl border border-gray-200 shadow-md hover:shadow-xl hover:shadow-indigo-100/50 hover:border-indigo-300 hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden relative
        min-h-[120px] 
        ${isDragging ? 'opacity-40 border-dashed border-indigo-400' : ''}
        ${borderClass} 
      `}
    >
      {/* Decorative Top Bar - Adds color pop */}
      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-400/80 to-purple-400/80 opacity-80 group-hover:opacity-100 transition-opacity duration-300 absolute top-0 left-0 z-10"></div>

      {/* Card Header */}
      <div className="p-5 pb-3 flex items-start gap-3 pt-6"> {/* Added pt-6 to accommodate decorative bar */}
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow duration-300">
          <img 
            src={getFaviconUrl(link.url)} 
            alt="icon" 
            className="w-6 h-6 object-contain transform group-hover:scale-110 transition-transform duration-300"
            onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
          {/* Fallback Icon if image fails (hidden by default logic above but good to have structure) */}
          <div className="hidden w-6 h-6 text-indigo-300">
             <Globe size={20}/>
          </div>
        </div>
        
        <div className="flex-1 min-w-0 pr-8"> 
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="block group/title">
            <h3 className="font-bold text-gray-800 truncate group-hover/title:text-indigo-600 transition-colors flex items-center gap-1 text-base tracking-tight">
              {link.title}
            </h3>
            <div className="text-xs text-gray-400 truncate font-medium tracking-wide mt-1 group-hover:text-indigo-400/80 transition-colors">
              {formatUrlDisplay(link.url)}
            </div>
          </a>

          {link.description && (
            <p className="text-xs text-gray-500 line-clamp-2 mt-2 leading-relaxed bg-gray-50/50 p-1.5 rounded-md border border-transparent group-hover:border-gray-100 transition-colors">
              {link.description}
            </p>
          )}
        </div>

        {/* Actions Menu - Fixed positioning overlap issue */}
        <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col gap-1 absolute top-4 right-2 bg-white/95 backdrop-blur-md p-1 rounded-lg border border-gray-200 shadow-md translate-x-2 group-hover:translate-x-0 z-20">
            <button 
              onClick={() => onEdit(link)}
              className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
              title="编辑"
            >
              <Edit2 size={14} />
            </button>
            <button 
              onClick={() => onDuplicate(link.url)}
              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
              title="复制 URL"
            >
              <Copy size={14} />
            </button>
            <button 
              onClick={() => onDelete(link.id, link.title)}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="删除"
            >
              <Trash2 size={14} />
            </button>
        </div>
      </div>

      {/* Sub Links - Enhanced Visuals */}
      {link.subLinks.length > 0 && (
        <div className="px-5 pb-5 pt-1 mt-auto">
          <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent my-3 w-full opacity-50"></div>
          <div className="flex flex-wrap gap-2">
            {link.subLinks.map((sub) => (
              <a 
                key={sub.id} 
                href={sub.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center px-2.5 py-1.5 rounded-md bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 text-xs font-medium transition-all duration-200 group/sub border border-gray-200 hover:border-indigo-200 hover:shadow-sm max-w-full"
              >
                <span className="truncate max-w-[120px]">{sub.title}</span>
                <ExternalLink size={10} className="text-gray-300 group-hover/sub:text-indigo-400 transition-colors ml-1.5 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
      
      {/* Drag Handle (Visual Only) */}
      <div 
        className="absolute top-2 right-2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 text-gray-300 p-1 hover:text-indigo-400 hover:bg-indigo-50/50 rounded z-10 transition-all"
        title="拖拽排序"
      >
      </div>
    </div>
  );
});

// --- 独立组件: LinkForm ---


const LinkForm = ({ 
  editingLink, 
  categories, 
  selectedCategory, 
  onSave, 
  onCancel 
}: { 
  editingLink: LinkItem | null, 
  categories: Category[], 
  selectedCategory: string,
  onSave: (data: any) => void,
  onCancel: () => void
}) => {
  const [formData, setFormData] = useState<Partial<LinkItem>>({
    title: '', url: '', description: '', categoryId: selectedCategory === 'ALL' ? (categories[0]?.id || 'uncategorized') : selectedCategory, subLinks: []
  });

  useEffect(() => {
    if (editingLink) {
      setFormData(editingLink);
    }
  }, [editingLink]);

  const handleSubLinkChange = (idx: number, field: keyof SubLink, value: string) => {
    const newSubs = [...(formData.subLinks || [])];
    newSubs[idx] = { ...newSubs[idx], [field]: value };
    setFormData({ ...formData, subLinks: newSubs });
  };

  const addSubLink = () => {
    setFormData({
      ...formData,
      subLinks: [...(formData.subLinks || []), { id: generateId(), title: '', url: '' }]
    });
  };

  const removeSubLink = (idx: number) => {
    const newSubs = [...(formData.subLinks || [])];
    newSubs.splice(idx, 1);
    setFormData({ ...formData, subLinks: newSubs });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
        <input 
          type="text" 
          value={formData.title || ''}
          onChange={e => setFormData({...formData, title: e.target.value})}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow"
          placeholder="例如: GitHub"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
        <input 
          type="url" 
          value={formData.url || ''}
          onChange={e => setFormData({...formData, url: e.target.value})}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
          placeholder="https://..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
        <select 
          value={formData.categoryId || ''}
          onChange={e => setFormData({...formData, categoryId: e.target.value})}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-white"
        >
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="uncategorized">未分类</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">描述 (可选)</label>
        <textarea 
          value={formData.description || ''}
          onChange={e => setFormData({...formData, description: e.target.value})}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
          rows={2}
        />
      </div>

      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700">子链接 (快捷入口)</label>
          <button type="button" onClick={addSubLink} className="text-xs flex items-center text-indigo-600 hover:text-indigo-800 font-semibold bg-white px-2 py-1 rounded border border-indigo-100 hover:border-indigo-200 shadow-sm transition-all">
            <Plus size={12} className="mr-1"/> 添加
          </button>
        </div>
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
          {formData.subLinks?.map((sub, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <input 
                placeholder="标题" 
                value={sub.title} 
                onChange={e => handleSubLinkChange(idx, 'title', e.target.value)}
                className="flex-1 p-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
              />
              <input 
                placeholder="URL" 
                value={sub.url} 
                onChange={e => handleSubLinkChange(idx, 'url', e.target.value)}
                className="flex-1 p-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
              />
              <button type="button" onClick={() => removeSubLink(idx)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                <X size={16} />
              </button>
            </div>
          ))}
          {formData.subLinks?.length === 0 && (
            <p className="text-xs text-gray-400 italic text-center py-2">暂无子链接</p>
          )}
        </div>
      </div>

      <div className="pt-4 flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
        <button 
          disabled={!formData.title || !formData.url}
          onClick={() => onSave(formData)} 
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-200 hover:shadow-indigo-300 transition-all"
        >
          保存链接
        </button>
      </div>
    </div>
  );
};

// --- 主应用组件 ---

export default function LinkManager() {
  // --- State ---
  const [categories, setCategories] = useState<Category[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | 'ALL'>('ALL');
  const [sidebarOpen, setSidebarOpen] = useState(false); 
  
  // Modal States
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  
  // Delete / Rename States
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'LINK' | 'CATEGORY', id: string, name: string } | null>(null);
  const [renamingCategory, setRenamingCategory] = useState<{ id: string, name: string } | null>(null);
  
  // Drag State
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // NEW: 记录放置位置 (前/后)
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);

  // Password Change States
  const [isChangePwdOpen, setIsChangePwdOpen] = useState(false);
  const [pwdForm, setPwdForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);


  // --- Data Loading & Persistence ---
  useEffect(() => {
    const loadData = async () => {
      const data = await StorageProvider.get();
      setCategories(data.categories);
      setLinks(data.links);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (categories.length > 0 || links.length > 0) {
      const timer = setTimeout(() => {
         StorageProvider.set({ categories, links });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [categories, links]);

  // --- Helper ---
  const getFilteredLinks = (linkList: LinkItem[]) => {
     if (!searchQuery.trim()) return linkList.sort((a, b) => a.order - b.order);
     const q = searchQuery.toLowerCase();
     return linkList.filter(l => 
        l.title.toLowerCase().includes(q) || 
        l.url.toLowerCase().includes(q) || 
        l.description?.toLowerCase().includes(q) ||
        l.subLinks.some(sl => sl.title.toLowerCase().includes(q))
      ).sort((a, b) => a.order - b.order);
  };

  // --- Actions ---
  const handleSaveLink = useCallback((linkData: Omit<LinkItem, 'id' | 'createdAt' | 'order'> & { id?: string }) => {
    if (linkData.id) {
      setLinks(prev => prev.map(l => l.id === linkData.id ? { ...l, ...linkData } : l));
    } else {
      setLinks(prev => {
        const newLink: LinkItem = {
            ...linkData,
            id: generateId(),
            createdAt: Date.now(),
            order: prev.length, 
        } as LinkItem;
        return [...prev, newLink];
      });
    }
    setIsLinkModalOpen(false);
    setEditingLink(null);
  }, []);

  const openEditModal = useCallback((link: LinkItem) => {
    setEditingLink(link);
    setIsLinkModalOpen(true);
  }, []);

  const requestDeleteLink = useCallback((id: string, title: string) => {
    setDeleteTarget({ type: 'LINK', id, name: title });
  }, []);

  const handleDuplicateLink = useCallback((url: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
  }, []);

  const handleAddCategory = (name: string) => {
    const newCat: Category = { id: `cat_${generateId()}`, name, order: categories.length };
    setCategories(prev => [...prev, newCat]);
    setIsCatModalOpen(false);
  };

  const requestDeleteCategory = (id: string, name: string) => setDeleteTarget({ type: 'CATEGORY', id, name });
  const requestRenameCategory = (id: string, currentName: string) => setRenamingCategory({ id, name: currentName });
  const performRenameCategory = () => {
    if (!renamingCategory) return;
    setCategories(prev => prev.map(c => c.id === renamingCategory.id ? { ...c, name: renamingCategory.name } : c));
    setRenamingCategory(null);
  };

  const performDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'LINK') {
       setLinks(prev => prev.filter(l => l.id !== deleteTarget.id));
    } else {
       setCategories(prev => prev.filter(c => c.id !== deleteTarget.id));
       setLinks(prev => prev.map(l => l.categoryId === deleteTarget.id ? { ...l, categoryId: 'uncategorized' } : l));
       if (selectedCategory === deleteTarget.id) setSelectedCategory('ALL');
    }
    setDeleteTarget(null);
  };

  const exportData = () => {
    const dataStr = JSON.stringify({ categories, links }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `link-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.categories && parsed.links) {
           setCategories(parsed.categories);
           setLinks(parsed.links);
        }
      } catch (err) {}
    };
    reader.readAsText(file);
  };

  // --- Drag and Drop Handlers ---

  const handleDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // UPDATE: 计算鼠标在卡片左侧还是右侧
  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault(); 
    
    // 如果不是拖拽卡片，不计算位置
    if (!draggedItem || draggedItem.type !== 'LINK') {
        setDragOverId(id);
        return;
    }

    const targetElement = e.currentTarget as HTMLElement;
    const rect = targetElement.getBoundingClientRect();
    const hoverMiddleX = rect.left + rect.width / 2;
    const hoverClientX = e.clientX;

    // 如果鼠标在中心点左边 -> BEFORE，否则 -> AFTER
    const position = hoverClientX < hoverMiddleX ? 'BEFORE' : 'AFTER';

    setDragOverId(id);
    setDropPosition(position); // 更新状态以显示边框
  }, [draggedItem]);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverId(null);
    setDropPosition(null);
  }, []);

  const handleDropWithState = useCallback((e: React.DragEvent, targetId: string, type: 'CATEGORY' | 'LINK') => {
    e.preventDefault();
    setDragOverId(null);
    setDropPosition(null);
    
    if (!draggedItem) return;

    // 1. Reorder Categories
    if (draggedItem.type === 'CATEGORY' && type === 'CATEGORY') {
      setCategories(prev => {
        const items = [...prev];
        const oldIndex = items.findIndex(i => i.id === draggedItem.id);
        const newIndex = items.findIndex(i => i.id === targetId);
        if (oldIndex !== -1 && newIndex !== -1) {
          const [moved] = items.splice(oldIndex, 1);
          items.splice(newIndex, 0, moved);
          return items.map((item, idx) => ({ ...item, order: idx }));
        }
        return prev;
      });
    }

    // 2. Reorder Links (Using Drop Position)
    if (draggedItem.type === 'LINK') {
        setLinks(prevLinks => {
            const allLinks = [...prevLinks];
            const draggedLinkIndex = allLinks.findIndex(l => l.id === draggedItem.id);
            if (draggedLinkIndex === -1) return prevLinks;

            // 2a. Link to Link
            if (type === 'LINK') {
                const targetLinkIndex = allLinks.findIndex(l => l.id === targetId);
                if (targetLinkIndex === -1) return prevLinks;

                const draggedLink = allLinks[draggedLinkIndex];
                const targetLink = allLinks[targetLinkIndex];

                // 如果拖拽到自己身上，且位置没变，直接返回
                if (draggedLinkIndex === targetLinkIndex) return prevLinks;

                // 更新分类
                draggedLink.categoryId = targetLink.categoryId;

                // 核心逻辑：先移除，再根据 dropPosition 决定插入位置
                const [removed] = allLinks.splice(draggedLinkIndex, 1);
                
                // 移除后，重新查找目标索引（因为数组长度变了，索引可能前移）
                let newTargetIndex = allLinks.findIndex(l => l.id === targetId);
                
                // 如果是插在后面 (AFTER)，索引需要+1
                if (dropPosition === 'AFTER') {
                    newTargetIndex = newTargetIndex + 1;
                }
                
                allLinks.splice(newTargetIndex, 0, removed);
                
                return allLinks.map((l, idx) => ({ ...l, order: idx }));
            }

            // 2b. Link to Category (Move Only)
            if (type === 'CATEGORY') {
                return allLinks.map(l => 
                   l.id === draggedItem.id ? { ...l, categoryId: targetId } : l
                );
            }
            
            return prevLinks;
        });
    }
    
    setDraggedItem(null);
  }, [draggedItem, dropPosition]); // 依赖 dropPosition

  return (
    <div className="flex h-screen bg-gray-50 text-gray-800 font-sans overflow-hidden">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl">
            <LayoutGrid size={24} />
            <span>Link Manager</span>
          </div>
          <button className="md:hidden text-gray-500" onClick={() => setSidebarOpen(false)}>
            <X />
          </button>
        </div>

        <div className="px-4 mb-4">
           <button 
            onClick={() => { setEditingLink(null); setIsLinkModalOpen(true); setSidebarOpen(false); }}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl shadow-md shadow-indigo-200 transition-all active:scale-95 font-medium"
           >
             <Plus size={18} /> 新建链接
           </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1 custom-scrollbar">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 py-2 mt-2">Categories</div>
          
          {/* All Links Item */}
          <div 
            onClick={() => { setSelectedCategory('ALL'); setSidebarOpen(false); }}
            className={`
              flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors
              ${selectedCategory === 'ALL' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-100'}
            `}
          >
            <FolderOpen size={18} />
            <span className="font-medium">全部链接</span>
            <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{links.length}</span>
          </div>

          {/* Sortable Category List */}
          {categories.map((cat) => (
             <div
              key={cat.id}
              draggable
              onDragStart={(e) => handleDragStart(e, { type: 'CATEGORY', id: cat.id })}
              onDragOver={(e) => handleDragOver(e, cat.id)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDropWithState(e, cat.id, 'CATEGORY')}
              onClick={() => { setSelectedCategory(cat.id); setSidebarOpen(false); }}
              className={`
                group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors relative
                ${selectedCategory === cat.id ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-100'}
                ${draggedItem?.id === cat.id ? 'opacity-50 border-2 border-dashed border-indigo-300' : ''}
                ${dragOverId === cat.id && draggedItem?.type === 'CATEGORY' ? 'border-t-2 border-indigo-500' : ''}
                ${dragOverId === cat.id && draggedItem?.type === 'LINK' ? 'bg-indigo-100 ring-2 ring-indigo-300' : ''}
              `}
             >
               <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"><GripVertical size={14} /></div>
               <span className="font-medium truncate flex-1">{cat.name}</span>
               
               <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      requestRenameCategory(cat.id, cat.name);
                    }}
                    className="p-1 hover:bg-indigo-100 rounded"
                 >
                   <Edit2 size={12} />
                 </button>
                 <button 
                   onClick={(e) => { e.stopPropagation(); requestDeleteCategory(cat.id, cat.name); }}
                   className="p-1 hover:bg-red-100 text-red-400 rounded"
                 >
                   <Trash2 size={12} />
                 </button>
               </div>
             </div>
          ))}
          
           {/* Uncategorized */}
           <div 
            onClick={() => { setSelectedCategory('uncategorized'); setSidebarOpen(false); }}
            onDragOver={(e) => handleDragOver(e, 'uncategorized')}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDropWithState(e, 'uncategorized', 'CATEGORY')}
            className={`
              flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors
              ${selectedCategory === 'uncategorized' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-100'}
              ${dragOverId === 'uncategorized' && draggedItem?.type === 'LINK' ? 'bg-indigo-100 ring-2 ring-indigo-300' : ''}
            `}
          >
            <Folder size={18} className="text-gray-400"/>
            <span className="font-medium">未分类</span>
             <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
               {links.filter(l => l.categoryId === 'uncategorized').length}
             </span>
          </div>

          <button 
            onClick={() => setIsCatModalOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-indigo-600 hover:bg-gray-50 rounded-lg mt-2 border border-dashed border-gray-300 hover:border-indigo-300 transition-colors"
          >
            <Plus size={14} /> 新建分类
          </button>
        </div>

        {/* Footer / Settings - UPDATED UI */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-2">
           <button onClick={exportData} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:text-indigo-600 rounded-lg transition-all shadow-sm">
             <Download size={14} /> 备份数据
           </button>
           <label className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:text-indigo-600 rounded-lg transition-all shadow-sm cursor-pointer">
             <Upload size={14} /> 恢复数据
             <input type="file" accept=".json" className="hidden" onChange={importData} />
           </label>
           <button
              onClick={() => {
                setPwdError("");
                setPwdSuccess("");
                setPwdForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
                setIsChangePwdOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:text-indigo-600 rounded-lg transition-all shadow-sm"
            >
              修改密码
            </button>

           <div className="text-center pt-2">
              <span className="text-xs font-medium text-gray-400">v1.0.0</span>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-gray-50/30"> {/* Slightly changed bg */}
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 h-16 flex items-center px-4 md:px-8 gap-4 shrink-0 z-10 shadow-sm">
          <button className="md:hidden p-2 -ml-2 text-gray-600" onClick={() => setSidebarOpen(true)}>
            <Menu />
          </button>
          
          <div className="flex-1 max-w-2xl relative group">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
             <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索链接、描述或子页面..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all"
             />
          </div>
        </header>

        {/* Content Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/50">
          {links.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <LinkIcon size={40} className="opacity-20" />
              </div>
              <p className="text-lg font-medium">暂无链接</p>
              <p className="text-sm">点击左侧 "新建链接" 开始添加</p>
            </div>
          ) : (
            <div className="space-y-10 pb-20">
              {selectedCategory === 'ALL' ? (
                <>
                  {/* Render Categories */}
                  {categories.map(cat => {
                    const catLinks = getFilteredLinks(links.filter(l => l.categoryId === cat.id));
                    if (catLinks.length === 0) return null;

                    return (
                      <section key={cat.id} className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center gap-3 mb-5">
                           <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                             <FolderOpen className="text-indigo-500" size={22} />
                             {cat.name}
                             <span className="text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{catLinks.length}</span>
                           </h2>
                           <div className="h-px bg-gray-200 flex-1"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {catLinks.map(link => (
                            <LinkCard 
                              key={link.id} 
                              link={link} 
                              draggedItem={draggedItem}
                              dragOverId={dragOverId}
                              dropPosition={dropPosition} 
                              onDragStart={handleDragStart}
                              onDragOver={handleDragOver}
                              onDragEnd={handleDragEnd}
                              onDrop={handleDropWithState}
                              onEdit={openEditModal}
                              onDelete={requestDeleteLink}
                              onDuplicate={handleDuplicateLink}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}

                  {/* Render Uncategorized (if any) */}
                  {(() => {
                    const uncatLinks = getFilteredLinks(links.filter(l => l.categoryId === 'uncategorized' || !categories.find(c => c.id === l.categoryId)));
                    if (uncatLinks.length === 0) return null;
                    return (
                      <section className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center gap-3 mb-5">
                           <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                             <Folder className="text-gray-400" size={22} />
                             未分类
                             <span className="text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{uncatLinks.length}</span>
                           </h2>
                           <div className="h-px bg-gray-200 flex-1"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {uncatLinks.map(link => (
                            <LinkCard 
                              key={link.id} 
                              link={link} 
                              draggedItem={draggedItem}
                              dragOverId={dragOverId}
                              dropPosition={dropPosition}
                              onDragStart={handleDragStart}
                              onDragOver={handleDragOver}
                              onDragEnd={handleDragEnd}
                              onDrop={handleDropWithState}
                              onEdit={openEditModal}
                              onDelete={requestDeleteLink}
                              onDuplicate={handleDuplicateLink}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })()}
                </>
              ) : (
                // Single Category View
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in zoom-in-95 duration-200">
                  {getFilteredLinks(links.filter(l => l.categoryId === selectedCategory)).map(link => (
                    <LinkCard 
                      key={link.id} 
                      link={link} 
                      draggedItem={draggedItem}
                      dragOverId={dragOverId}
                      dropPosition={dropPosition}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      onDrop={handleDropWithState}
                      onEdit={openEditModal}
                      onDelete={requestDeleteLink}
                      onDuplicate={handleDuplicateLink}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* --- Modals --- */}
      
      <Modal 
        isOpen={isLinkModalOpen} 
        onClose={() => setIsLinkModalOpen(false)} 
        title={editingLink ? "编辑链接" : "添加新链接"}
      >
        <LinkForm 
          editingLink={editingLink}
          categories={categories}
          selectedCategory={selectedCategory}
          onSave={handleSaveLink}
          onCancel={() => setIsLinkModalOpen(false)}
        />
      </Modal>

      <Modal
        isOpen={isCatModalOpen}
        onClose={() => setIsCatModalOpen(false)}
        title="添加新分类"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <input 
            id="new-cat-name"
            type="text" 
            placeholder="分类名称" 
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            onKeyDown={(e) => {
              if(e.key === 'Enter') handleAddCategory((e.target as HTMLInputElement).value);
            }}
          />
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsCatModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
            <button 
              onClick={() => {
                 const input = document.getElementById('new-cat-name') as HTMLInputElement;
                 if(input.value) handleAddCategory(input.value);
              }} 
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md"
            >
              添加分类
            </button>
          </div>
        </div>
      </Modal>

      {/* Rename Category Modal */}
      <Modal
        isOpen={!!renamingCategory}
        onClose={() => setRenamingCategory(null)}
        title="重命名分类"
        maxWidth="max-w-md"
      >
         <div className="space-y-4">
          <input 
            value={renamingCategory?.name || ''}
            onChange={(e) => setRenamingCategory(prev => prev ? { ...prev, name: e.target.value } : null)}
            type="text" 
            placeholder="分类名称" 
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            onKeyDown={(e) => {
              if(e.key === 'Enter') performRenameCategory();
            }}
          />
          <div className="flex justify-end gap-3">
            <button onClick={() => setRenamingCategory(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
            <button 
              disabled={!renamingCategory?.name}
              onClick={performRenameCategory}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="确认删除"
        maxWidth="max-w-sm"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-500 mb-2">
            <AlertTriangle size={24} />
          </div>
          <p className="text-gray-600">
            您确定要删除 <span className="font-bold text-gray-800">{deleteTarget?.name}</span> 吗？
          </p>
          {deleteTarget?.type === 'CATEGORY' && (
             <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">
               警告: 删除分类会将该分类下的所有链接移动到"未分类"。
             </p>
          )}
          <div className="flex w-full gap-3 pt-2">
            <button 
              onClick={() => setDeleteTarget(null)} 
              className="flex-1 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              取消
            </button>
            <button 
              onClick={performDelete} 
              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-md"
            >
              确认删除
            </button>
          </div>
        </div>
      </Modal>
          <Modal
  isOpen={isChangePwdOpen}
  onClose={() => setIsChangePwdOpen(false)}
  title="修改访问密码"
  maxWidth="max-w-md"
>
  <div className="space-y-4">
    {pwdError && (
      <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
        {pwdError}
      </div>
    )}
    {pwdSuccess && (
      <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
        {pwdSuccess}
      </div>
    )}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        当前密码
      </label>
      <input
        type="password"
        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
        value={pwdForm.oldPassword}
        onChange={(e) =>
          setPwdForm((f) => ({ ...f, oldPassword: e.target.value }))
        }
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        新密码
      </label>
      <input
        type="password"
        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
        value={pwdForm.newPassword}
        onChange={(e) =>
          setPwdForm((f) => ({ ...f, newPassword: e.target.value }))
        }
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        确认新密码
      </label>
      <input
        type="password"
        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
        value={pwdForm.confirmPassword}
        onChange={(e) =>
          setPwdForm((f) => ({ ...f, confirmPassword: e.target.value }))
        }
      />
    </div>
    <div className="flex justify-end gap-3 pt-2">
      <button
        onClick={() => setIsChangePwdOpen(false)}
        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
      >
        取消
      </button>
      <button
        disabled={
          pwdLoading ||
          !pwdForm.oldPassword ||
          !pwdForm.newPassword ||
          pwdForm.newPassword !== pwdForm.confirmPassword
        }
        onClick={async () => {
          setPwdError("");
          setPwdSuccess("");
          if (pwdForm.newPassword !== pwdForm.confirmPassword) {
            setPwdError("两次输入的新密码不一致");
            return;
          }
          setPwdLoading(true);
          try {
            const res = await fetch("/api/change-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                oldPassword: pwdForm.oldPassword,
                newPassword: pwdForm.newPassword,
              }),
            });
            const data = await res.json();
            if (!res.ok) {
              setPwdError(data.error || "修改失败");
            } else {
              setPwdSuccess("密码修改成功，下次请使用新密码登录");
              setPwdForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
            }
          } catch (err) {
            setPwdError("网络异常，请稍后再试");
          } finally {
            setPwdLoading(false);
          }
        }}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pwdLoading ? "提交中..." : "保存密码"}
      </button>
    </div>
  </div>
</Modal>

    </div>
  );
}
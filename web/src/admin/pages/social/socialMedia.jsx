import { useState, useEffect, useMemo } from 'react';
import { videoService } from '../../../services/videoService';
import { parseVideoUrl } from '../../../utils/parseVideoUrl';
import Toast from '../../../components/Toast';
import './socialMedia.css';

const thumbOf = (code) => `https://i.ytimg.com/vi/${code}/hqdefault.jpg`;

export default function SocialMedia() {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [link, setLink] = useState('');
    const [title, setTitle] = useState('');
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [toast, setToast] = useState({ message: '', type: 'success' });

    const showToast = (message, type = 'success') => {
        setToast({ message: '', type });
        setTimeout(() => setToast({ message, type }), 10);
    };

    const load = async () => {
        try {
            setVideos(await videoService.getAll());
        } catch (err) {
            console.error(err);
            showToast('Failed to load videos', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // live preview of the pasted link
    const parsed = useMemo(() => (link.trim() ? parseVideoUrl(link) : null), [link]);
    const linkError =
        link.trim() && (!parsed || parsed.platform !== 'youtube')
            ? 'Paste a valid YouTube Shorts link'
            : '';

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!parsed || parsed.platform !== 'youtube') {
            showToast('Paste a valid YouTube Shorts link', 'error');
            return;
        }
        setSaving(true);
        try {
            await videoService.add({
                platform: 'youtube',
                code: parsed.code,
                url: link.trim(),
                title: title.trim(),
            });
            setLink('');
            setTitle('');
            showToast('Video added');
            await load();
        } catch (err) {
            showToast(err.code === '23505' ? 'This video is already added' : err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (v) => {
        setBusyId(v.id);
        try {
            await videoService.setActive(v.id, !v.is_active);
            setVideos((list) => list.map((x) => (x.id === v.id ? { ...x, is_active: !v.is_active } : x)));
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (v) => {
        if (!window.confirm(`Delete "${v.title || v.code}"?`)) return;
        setBusyId(v.id);
        try {
            await videoService.remove(v.id);
            setVideos((list) => list.filter((x) => x.id !== v.id));
            showToast('Video deleted');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="sm-page">
            <div className="sm-header">
                <h2 className="sm-title">Social Media</h2>
                <p className="sm-sub">
                    Paste a YouTube Shorts link. The latest 8 active videos show on the home page.
                </p>
            </div>

            {/* ── Add form ── */}
            <form className="sm-card sm-form" onSubmit={handleAdd}>
                <div className="sm-form-fields">
                    <label className="sm-label">
                        YouTube Shorts link
                        <input
                            type="url"
                            className={`sm-input ${linkError ? 'sm-input--error' : ''}`}
                            placeholder="https://www.youtube.com/shorts/xxxxxxxxxxx"
                            value={link}
                            onChange={(e) => setLink(e.target.value)}
                            required
                        />
                        {linkError && <span className="sm-err">{linkError}</span>}
                    </label>

                    <label className="sm-label">
                        Title (optional)
                        <input
                            type="text"
                            className="sm-input"
                            placeholder="e.g. Customer unboxing"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={80}
                        />
                    </label>

                    <button
                        type="submit"
                        className="sm-btn sm-btn--primary"
                        disabled={saving || !parsed || parsed.platform !== 'youtube'}
                    >
                        {saving ? 'Adding...' : 'Add video'}
                    </button>
                </div>

                <div className="sm-preview">
                    {parsed?.platform === 'youtube' ? (
                        <img src={thumbOf(parsed.code)} alt="Preview" />
                    ) : (
                        <div className="sm-preview-empty">Preview</div>
                    )}
                </div>
            </form>

            {/* ── List ── */}
            <div className="sm-card">
                <div className="sm-list-head">
                    <h3>Videos ({videos.length})</h3>
                </div>

                {loading ? (
                    <p className="sm-empty">Loading...</p>
                ) : videos.length === 0 ? (
                    <p className="sm-empty">No videos yet. Add your first Short above.</p>
                ) : (
                    <ul className="sm-list">
                        {videos.map((v) => (
                            <li key={v.id} className={`sm-item ${v.is_active ? '' : 'sm-item--hidden'}`}>
                                <img
                                    className="sm-thumb"
                                    src={v.thumbnail_url || thumbOf(v.code)}
                                    alt={v.title || v.code}
                                    loading="lazy"
                                />

                                <div className="sm-item-info">
                                    <p className="sm-item-title">{v.title || 'Untitled'}</p>
                                    <a className="sm-item-link" href={v.url} target="_blank" rel="noopener noreferrer">
                                        {v.url}
                                    </a>
                                    <span className="sm-item-meta">
                                        {v.platform} · {new Date(v.created_at).toLocaleDateString('en-IN')}
                                        {!v.is_active && ' · Hidden'}
                                    </span>
                                </div>

                                <div className="sm-item-actions">
                                    <button
                                        className="sm-btn"
                                        onClick={() => handleToggle(v)}
                                        disabled={busyId === v.id}
                                    >
                                        {v.is_active ? 'Hide' : 'Show'}
                                    </button>
                                    <button
                                        className="sm-btn sm-btn--danger"
                                        onClick={() => handleDelete(v)}
                                        disabled={busyId === v.id}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
        </div>
    );
}
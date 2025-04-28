import React from 'react';

const Footer: React.FC = () => {
    return (
        <footer className="bg-gray-900 text-white text-center py-4">
            <p>© 2025 Memo App. All rights reserved.</p>
            <p className="text-sm">
                <a href="https://github.com/yourusername/memo-app" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-500">
                    GitHub Repository
                </a>
            </p>
        </footer>
    );
};

export default Footer;

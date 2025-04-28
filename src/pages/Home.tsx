
import {Link} from 'react-router-dom';

function Home() {
    return (
        <div className="flex flex-col items-center justify-center h-screen">
            <h1 className="text-3xl mb-4">Welcome to My Blog</h1>
            <Link to="/memo" className="text-blue-500 underline">
                Go to Memo Page
            </Link>
        </div>
    );
}

export default Home;
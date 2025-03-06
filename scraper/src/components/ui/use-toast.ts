interface ToastOptions {
    title?: string;
    description?: string;
    variant?: 'default' | 'destructive';
}

export function toast(options: ToastOptions) {
    // Create a simple toast notification
    const toastElement = document.createElement('div');
    toastElement.className = `fixed bottom-4 right-4 p-4 rounded-md shadow-lg ${
        options.variant === 'destructive' ? 'bg-red-500' : 'bg-green-500'
    } text-white`;

    const titleElement = document.createElement('div');
    titleElement.className = 'font-bold';
    titleElement.textContent = options.title || '';
    toastElement.appendChild(titleElement);

    const descElement = document.createElement('div');
    descElement.textContent = options.description || '';
    toastElement.appendChild(descElement);

    document.body.appendChild(toastElement);

    // Remove the toast after 3 seconds
    setTimeout(() => {
        toastElement.remove();
    }, 3000);
}

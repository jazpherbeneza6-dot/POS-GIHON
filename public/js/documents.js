// Documents Management Module

let documents = [];
let items = [];
let sales = [];
let purchases = [];
let selectedFile = null;
let currentDocument = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupDragAndDrop();
    setupEventListeners();
});

// Load all data
async function loadData() {
    try {
        await Promise.all([
            loadDocuments(),
            loadItems(),
            loadSales(),
            loadPurchases()
        ]);
        updateStats();
        renderDocuments();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Load documents
async function loadDocuments() {
    try {
        // For now, use localStorage - replace with API when backend ready
        const storedDocs = localStorage.getItem('documents');
        documents = storedDocs ? JSON.parse(storedDocs) : [];
    } catch (error) {
        console.error('Error loading documents:', error);
        documents = [];
    }
}

// Save documents to localStorage
function saveDocuments() {
    try {
        localStorage.setItem('documents', JSON.stringify(documents));
    } catch (error) {
        console.error('Error saving documents:', error);
    }
}

// Load items for assignment
async function loadItems() {
    try {
        items = await itemsAPI.getAll();
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

// Load sales for assignment
async function loadSales() {
    try {
        sales = await salesAPI.getAll({ limit: 100 });
    } catch (error) {
        console.error('Error loading sales:', error);
    }
}

// Load purchases for assignment
async function loadPurchases() {
    try {
        purchases = await purchasesAPI.getAll({ limit: 100 });
    } catch (error) {
        console.error('Error loading purchases:', error);
    }
}

// Update stats
function updateStats() {
    const total = documents.length;
    const images = documents.filter(d => d.type === 'image').length;
    const pdfs = documents.filter(d => d.type === 'pdf').length;
    const other = total - images - pdfs;

    document.getElementById('totalDocs').textContent = total;
    document.getElementById('totalImages').textContent = images;
    document.getElementById('totalPdfs').textContent = pdfs;
    document.getElementById('totalOther').textContent = other;
}

// Render documents
function renderDocuments() {
    const container = document.getElementById('documentsContainer');

    if (documents.length === 0) {
        container.innerHTML = `
      <div class="empty-documents">
        <div class="empty-icon">📄</div>
        <div class="empty-title">No Documents Yet</div>
        <div class="empty-text">Upload your first document to get started</div>
        <button class="btn btn-primary" onclick="openUploadModal()">
          📤 Upload Document
        </button>
      </div>
    `;
        return;
    }

    // Apply filters
    const filtered = getFilteredDocuments();

    if (filtered.length === 0) {
        container.innerHTML = `
      <div class="empty-documents">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No Documents Found</div>
        <div class="empty-text">Try adjusting your filters</div>
      </div>
    `;
        return;
    }

    container.innerHTML = `
    <div class="documents-grid">
      ${filtered.map(doc => renderDocumentCard(doc)).join('')}
    </div>
  `;
}

// Render single document card
function renderDocumentCard(doc) {
    const icon = getFileIcon(doc.type);
    const typeColor = getTypeColor(doc.type);

    return `
    <div class="document-card" onclick="viewDocument(${doc.id})">
      <div class="document-preview">
        ${doc.dataUrl && doc.type === 'image'
            ? `<img src="${doc.dataUrl}" alt="${doc.name}">`
            : `<span style="font-size: 64px;">${icon}</span>`
        }
        <div class="document-type-badge" style="background: ${typeColor};">
          ${doc.type.toUpperCase()}
        </div>
      </div>
      <div class="document-info">
        <div class="document-title">${doc.name}</div>
        <div class="document-meta">
          <div class="document-meta-item">
            📁 ${doc.category}
          </div>
          <div class="document-meta-item">
            📅 ${formatDate(doc.uploadDate)}
          </div>
          <div class="document-meta-item">
            📏 ${doc.size}
          </div>
          ${doc.assignedTo ? `
            <div class="document-meta-item">
              🔗 ${doc.assignedTo}
            </div>
          ` : ''}
        </div>
        <div class="document-actions" onclick="event.stopPropagation()">
          <button class="doc-action-btn btn-view" onclick="viewDocument(${doc.id})">
            👁️ View
          </button>
          <button class="doc-action-btn btn-delete" onclick="deleteDocument(${doc.id})">
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>
  `;
}

// Get filtered documents
function getFilteredDocuments() {
    let filtered = [...documents];

    // Search filter
    const searchTerm = document.getElementById('searchDocuments').value.toLowerCase();
    if (searchTerm) {
        filtered = filtered.filter(doc =>
            doc.name.toLowerCase().includes(searchTerm) ||
            doc.description.toLowerCase().includes(searchTerm) ||
            doc.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );
    }

    // Type filter
    const typeFilter = document.getElementById('filterType').value;
    if (typeFilter) {
        filtered = filtered.filter(doc => doc.type === typeFilter);
    }

    // Category filter
    const categoryFilter = document.getElementById('filterCategory').value;
    if (categoryFilter) {
        filtered = filtered.filter(doc => doc.category === categoryFilter);
    }

    // Sort
    const sortBy = document.getElementById('filterSort').value;
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'date-desc':
                return new Date(b.uploadDate) - new Date(a.uploadDate);
            case 'date-asc':
                return new Date(a.uploadDate) - new Date(b.uploadDate);
            case 'name-asc':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            default:
                return 0;
        }
    });

    return filtered;
}

// Filter documents
function filterDocuments() {
    renderDocuments();
}

// Clear filters
function clearFilters() {
    document.getElementById('searchDocuments').value = '';
    document.getElementById('filterType').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterSort').value = 'date-desc';
    filterDocuments();
}

// Open upload modal
function openUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
    document.getElementById('uploadForm').reset();
    clearFileSelection();
}

// Close upload modal
function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
    selectedFile = null;
}

// Setup drag and drop
function setupDragAndDrop() {
    const uploadZone = document.getElementById('uploadZone');

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
}

// Handle file select
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// Handle file
function handleFile(file) {
    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
        showAlert('File size must be less than 10MB', 'error');
        return;
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

    if (!validTypes.includes(file.type)) {
        showAlert('Invalid file type. Please upload PDF, JPG, PNG, GIF, or DOC files.', 'error');
        return;
    }

    selectedFile = file;

    // Show file preview
    document.getElementById('filePreview').style.display = 'block';
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);

    // Set icon based on type
    const icon = file.type.startsWith('image/') ? '🖼️' :
        file.type === 'application/pdf' ? '📑' : '📄';
    document.getElementById('fileIcon').textContent = icon;

    // Auto-fill document name
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    document.getElementById('docName').value = nameWithoutExt;
}

// Clear file selection
function clearFileSelection() {
    selectedFile = null;
    document.getElementById('filePreview').style.display = 'none';
    document.getElementById('fileInput').value = '';
}

// Update assign options
function updateAssignOptions() {
    const assignType = document.getElementById('docAssignType').value;
    const assignGroup = document.getElementById('assignSelectGroup');
    const assignSelect = document.getElementById('docAssignTo');
    const assignLabel = document.getElementById('assignLabel');

    if (!assignType) {
        assignGroup.style.display = 'none';
        return;
    }

    assignGroup.style.display = 'block';
    assignSelect.innerHTML = '<option value="">Select...</option>';

    switch (assignType) {
        case 'item':
            assignLabel.textContent = 'Select Item';
            items.forEach(item => {
                assignSelect.innerHTML += `<option value="item-${item.id}">${item.name}</option>`;
            });
            break;

        case 'order':
            assignLabel.textContent = 'Select Order/Invoice';
            [...sales, ...purchases].forEach(order => {
                const type = order.receipt_number ? 'Sale' : 'Purchase';
                const number = order.receipt_number || order.po_number || order.id;
                assignSelect.innerHTML += `<option value="order-${order.id}">${type} - ${number}</option>`;
            });
            break;

        case 'vendor':
            assignLabel.textContent = 'Select Vendor/Supplier';
            // Extract unique suppliers from purchases
            const suppliers = [...new Set(purchases.map(p => p.supplier_name).filter(Boolean))];
            suppliers.forEach(supplier => {
                assignSelect.innerHTML += `<option value="vendor-${supplier}">${supplier}</option>`;
            });
            break;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Upload form submission
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!selectedFile) {
                showAlert('Please select a file to upload', 'error');
                return;
            }

            // Read file as data URL
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;

                // Determine file type
                let type = 'other';
                if (selectedFile.type.startsWith('image/')) {
                    type = 'image';
                } else if (selectedFile.type === 'application/pdf') {
                    type = 'pdf';
                }

                // Get assignment info
                const assignTo = document.getElementById('docAssignTo').value;
                let assignedTo = null;
                if (assignTo) {
                    const assignType = document.getElementById('docAssignType').value;
                    const assignSelect = document.getElementById('docAssignTo');
                    const selectedOption = assignSelect.options[assignSelect.selectedIndex];
                    assignedTo = selectedOption ? selectedOption.text : null;
                }

                // Create document object
                const doc = {
                    id: Date.now(),
                    name: document.getElementById('docName').value,
                    category: document.getElementById('docCategory').value,
                    description: document.getElementById('docDescription').value || '',
                    tags: document.getElementById('docTags').value.split(',').map(t => t.trim()).filter(Boolean),
                    type: type,
                    size: formatFileSize(selectedFile.size),
                    sizeBytes: selectedFile.size,
                    fileName: selectedFile.name,
                    dataUrl: dataUrl,
                    assignTo: assignTo || null,
                    assignedTo: assignedTo,
                    uploadDate: new Date().toISOString()
                };

                // Add to documents
                documents.unshift(doc); // Add to beginning
                saveDocuments();

                showAlert('Document uploaded successfully! 📄', 'success');
                closeUploadModal();
                updateStats();
                renderDocuments();
            };

            reader.readAsDataURL(selectedFile);
        });
    }

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// View document
function viewDocument(docId) {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    currentDocument = doc;

    // Set modal title
    document.getElementById('viewDocName').textContent = doc.name;

    // Show preview
    const contentDiv = document.getElementById('viewDocContent');
    if (doc.type === 'image') {
        contentDiv.innerHTML = `
      <img src="${doc.dataUrl}" alt="${doc.name}" 
        style="max-width: 100%; max-height: 500px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    `;
    } else if (doc.type === 'pdf') {
        contentDiv.innerHTML = `
      <div style="padding: 40px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 12px;">
        <div style="font-size: 72px; margin-bottom: 16px;">📑</div>
        <div style="font-size: 18px; font-weight: 600; color: #1a1f3a; margin-bottom: 8px;">${doc.name}</div>
        <div style="font-size: 14px; color: #868e96;">PDF Document</div>
      </div>
    `;
    } else {
        contentDiv.innerHTML = `
      <div style="padding: 40px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 12px;">
        <div style="font-size: 72px; margin-bottom: 16px;">📄</div>
        <div style="font-size: 18px; font-weight: 600; color: #1a1f3a; margin-bottom: 8px;">${doc.name}</div>
        <div style="font-size: 14px; color: #868e96;">${doc.fileName}</div>
      </div>
    `;
    }

    // Show details
    const detailsDiv = document.getElementById('viewDocDetails');
    detailsDiv.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
      <div>
        <div style="font-size: 12px; color: #868e96; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Category</div>
        <div style="font-size: 14px; font-weight: 600; color: #1a1f3a;">${doc.category}</div>
      </div>
      <div>
        <div style="font-size: 12px; color: #868e96; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Upload Date</div>
        <div style="font-size: 14px; font-weight: 600; color: #1a1f3a;">${formatDate(doc.uploadDate)}</div>
      </div>
      <div>
        <div style="font-size: 12px; color: #868e96; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">File Size</div>
        <div style="font-size: 14px; font-weight: 600; color: #1a1f3a;">${doc.size}</div>
      </div>
      ${doc.assignedTo ? `
        <div>
          <div style="font-size: 12px; color: #868e96; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Assigned To</div>
          <div style="font-size: 14px; font-weight: 600; color: #1a1f3a;">${doc.assignedTo}</div>
        </div>
      ` : ''}
    </div>
    ${doc.description ? `
      <div style="margin-top: 16px;">
        <div style="font-size: 12px; color: #868e96; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Description</div>
        <div style="font-size: 14px; color: #495057;">${doc.description}</div>
      </div>
    ` : ''}
    ${doc.tags.length > 0 ? `
      <div style="margin-top: 16px;">
        <div style="font-size: 12px; color: #868e96; text-transform: uppercase; font-weight: 700; margin-bottom: 8px;">Tags</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${doc.tags.map(tag => `
            <span style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%); 
              color: #667eea; padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;">
              ${tag}
            </span>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

    // Open modal
    document.getElementById('viewModal').classList.add('active');
}

// Close view modal
function closeViewModal() {
    document.getElementById('viewModal').classList.remove('active');
    currentDocument = null;
}

// Download document
function downloadDocument() {
    if (!currentDocument || !currentDocument.dataUrl) return;

    const link = document.createElement('a');
    link.href = currentDocument.dataUrl;
    link.download = currentDocument.fileName;
    link.click();

    showAlert('Document downloaded! 📥', 'success');
}

// Delete document
async function deleteDocument(docId) {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
        documents = documents.filter(d => d.id !== docId);
        saveDocuments();

        showAlert('Document deleted successfully', 'success');
        updateStats();
        renderDocuments();
    } catch (error) {
        showAlert('Failed to delete document', 'error');
    }
}

// Helper functions
function getFileIcon(type) {
    switch (type) {
        case 'image': return '🖼️';
        case 'pdf': return '📑';
        default: return '📄';
    }
}

function getTypeColor(type) {
    switch (type) {
        case 'image': return '#51cf66';
        case 'pdf': return '#ff6b6b';
        default: return '#667eea';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(new Date(dateString));
}
